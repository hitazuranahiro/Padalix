package platform

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	defaultClaimLifetime = 24 * time.Hour
	maximumClaimLifetime = 7 * 24 * time.Hour
	defaultClaimAttempts = 5
)

type recipientClaim struct {
	ID                string     `json:"id"`
	TransferReference string     `json:"transferReference"`
	RecipientName     string     `json:"recipientName"`
	Status            string     `json:"status"`
	ExpiresAt         time.Time  `json:"expiresAt"`
	RedeemedAt        *time.Time `json:"redeemedAt,omitempty"`
}

func (s *Service) createRecipientClaim(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ExpiresInMinutes int `json:"expiresInMinutes"`
		MaxAttempts      int `json:"maxAttempts"`
	}
	if err := decode(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid claim request")
		return
	}
	if input.ExpiresInMinutes == 0 {
		input.ExpiresInMinutes = int(defaultClaimLifetime / time.Minute)
	}
	if input.MaxAttempts == 0 {
		input.MaxAttempts = defaultClaimAttempts
	}
	lifetime := time.Duration(input.ExpiresInMinutes) * time.Minute
	if lifetime < 5*time.Minute || lifetime > maximumClaimLifetime || input.MaxAttempts < 1 || input.MaxAttempts > 10 {
		writeError(w, http.StatusBadRequest, "invalid claim request")
		return
	}

	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "claim unavailable")
		return
	}
	defer tx.Rollback(r.Context())

	var transferID, recipientID, recipientName, transferStatus string
	err = tx.QueryRow(r.Context(), `select t.id,r.id,r.display_name,t.status
		from platform.transfer t join platform.recipient r on r.id=t.recipient_id
		where t.reference=$1 and t.account_id=$2 and r.account_id=$2
		for update of t`, r.PathValue("reference"), acct.ID).Scan(&transferID, &recipientID, &recipientName, &transferStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "transfer recipient not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "claim unavailable")
		return
	}
	if transferStatus != "confirmed" {
		writeError(w, http.StatusConflict, "transfer is not claimable")
		return
	}

	if _, err := tx.Exec(r.Context(), `update platform.recipient_claim_intent
		set status='expired',updated_at=now()
		where transfer_id=$1 and status='active' and expires_at <= now()`, transferID); err != nil {
		writeError(w, http.StatusInternalServerError, "claim unavailable")
		return
	}
	var completedID string
	err = tx.QueryRow(r.Context(), `select id from platform.recipient_claim_intent where transfer_id=$1 and status='redeemed' limit 1`, transferID).Scan(&completedID)
	if err == nil {
		writeError(w, http.StatusConflict, "transfer claim already redeemed")
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "claim unavailable")
		return
	}
	var activeID string
	err = tx.QueryRow(r.Context(), `select id from platform.recipient_claim_intent where transfer_id=$1 and status='active'`, transferID).Scan(&activeID)
	if err == nil {
		writeError(w, http.StatusConflict, "an active claim already exists")
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "claim unavailable")
		return
	}

	claimID := newID()
	token, tokenHash, err := newRecipientClaimToken(claimID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "claim unavailable")
		return
	}
	expiresAt := time.Now().UTC().Add(lifetime)
	_, err = tx.Exec(r.Context(), `insert into platform.recipient_claim_intent(
		id,transfer_id,recipient_id,account_id,token_hash,max_attempts,expires_at
	) values($1,$2,$3,$4,$5,$6,$7)`, claimID, transferID, recipientID, acct.ID, tokenHash, input.MaxAttempts, expiresAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "claim could not be created")
		return
	}
	if _, err := tx.Exec(r.Context(), `insert into platform.activity_event(account_id,event_type,resource_type,resource_id,summary,metadata)
		values($1,'recipient_claim.created','recipient_claim',$2,$3,$4)`, acct.ID, claimID, "Recipient claim created for "+recipientName,
		map[string]any{"transferReference": r.PathValue("reference"), "recipientId": recipientID, "expiresAt": expiresAt}); err != nil {
		writeError(w, http.StatusInternalServerError, "claim activity could not be recorded")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "claim commit failed")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"id": claimID, "transferReference": r.PathValue("reference"), "recipientId": recipientID,
		"recipientName": recipientName, "status": "active", "expiresAt": expiresAt,
		"claimToken": token,
	})
}

func (s *Service) redeemRecipientClaim(w http.ResponseWriter, r *http.Request) {
	idem := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if len(idem) < 8 || len(idem) > 100 {
		writeError(w, http.StatusBadRequest, "valid idempotency key required")
		return
	}
	var input struct {
		ClaimToken string `json:"claimToken"`
	}
	if err := decode(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid claim redemption")
		return
	}
	claimID, suppliedHash, ok := parseRecipientClaimToken(input.ClaimToken)
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid claim token")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "claim unavailable")
		return
	}
	defer tx.Rollback(r.Context())

	var storedHash []byte
	var status, existingIdem, transferReference, recipientName, accountID string
	var failedAttempts, maxAttempts int
	var expiresAt time.Time
	var redeemedAt *time.Time
	err = tx.QueryRow(r.Context(), `select c.token_hash,c.status,c.failed_attempts,c.max_attempts,c.expires_at,
		coalesce(c.redemption_idempotency_key,''),c.redeemed_at,t.reference,r.display_name,c.account_id
		from platform.recipient_claim_intent c
		join platform.transfer t on t.id=c.transfer_id
		join platform.recipient r on r.id=c.recipient_id
		where c.id=$1 for update of c`, claimID).Scan(&storedHash, &status, &failedAttempts, &maxAttempts, &expiresAt, &existingIdem, &redeemedAt, &transferReference, &recipientName, &accountID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusUnauthorized, "invalid claim token")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "claim unavailable")
		return
	}
	if status == "redeemed" {
		if existingIdem == idem {
			writeJSON(w, http.StatusOK, recipientClaim{ID: claimID, TransferReference: transferReference, RecipientName: recipientName, Status: status, ExpiresAt: expiresAt, RedeemedAt: redeemedAt})
			return
		}
		writeError(w, http.StatusConflict, "claim already redeemed")
		return
	}
	if status != "active" {
		writeError(w, http.StatusConflict, "claim is not active")
		return
	}
	if !time.Now().UTC().Before(expiresAt) {
		if _, err := tx.Exec(r.Context(), `update platform.recipient_claim_intent set status='expired',updated_at=now() where id=$1`, claimID); err != nil || tx.Commit(r.Context()) != nil {
			writeError(w, http.StatusInternalServerError, "claim unavailable")
			return
		}
		writeError(w, http.StatusGone, "claim expired")
		return
	}
	if subtle.ConstantTimeCompare(storedHash, suppliedHash) != 1 {
		failedAttempts, nextStatus := nextClaimFailureState(failedAttempts, maxAttempts)
		if _, err := tx.Exec(r.Context(), `update platform.recipient_claim_intent set failed_attempts=$2,status=$3,updated_at=now() where id=$1`, claimID, failedAttempts, nextStatus); err != nil || tx.Commit(r.Context()) != nil {
			writeError(w, http.StatusInternalServerError, "claim unavailable")
			return
		}
		writeError(w, http.StatusUnauthorized, "invalid claim token")
		return
	}

	now := time.Now().UTC()
	_, err = tx.Exec(r.Context(), `update platform.recipient_claim_intent
		set status='redeemed',redeemed_at=$2,redemption_idempotency_key=$3,updated_at=$2 where id=$1 and status='active'`, claimID, now, idem)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "claim could not be redeemed")
		return
	}
	if _, err := tx.Exec(r.Context(), `insert into platform.activity_event(account_id,event_type,resource_type,resource_id,summary,metadata)
		values($1,'recipient_claim.redeemed','recipient_claim',$2,$3,$4)`, accountID, claimID, "Recipient claim redeemed by "+recipientName,
		map[string]any{"transferReference": transferReference}); err != nil {
		writeError(w, http.StatusInternalServerError, "claim activity could not be recorded")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "claim commit failed")
		return
	}
	writeJSON(w, http.StatusOK, recipientClaim{ID: claimID, TransferReference: transferReference, RecipientName: recipientName, Status: "redeemed", ExpiresAt: expiresAt, RedeemedAt: &now})
}

func nextClaimFailureState(failedAttempts, maxAttempts int) (int, string) {
	failedAttempts++
	if failedAttempts >= maxAttempts {
		return failedAttempts, "locked"
	}
	return failedAttempts, "active"
}

func newRecipientClaimToken(claimID string) (string, []byte, error) {
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return "", nil, err
	}
	token := claimID + "." + base64.RawURLEncoding.EncodeToString(secret)
	hash := sha256.Sum256([]byte(token))
	return token, hash[:], nil
}

func parseRecipientClaimToken(token string) (string, []byte, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 || len(parts[0]) != 36 {
		return "", nil, false
	}
	secret, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || len(secret) != 32 {
		return "", nil, false
	}
	hash := sha256.Sum256([]byte(token))
	return parts[0], hash[:], true
}
