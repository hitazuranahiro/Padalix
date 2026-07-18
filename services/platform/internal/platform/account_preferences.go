package platform

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var (
	preferredNamePattern = regexp.MustCompile(`^[\p{L}\p{M}][\p{L}\p{M} .'-]{0,78}[\p{L}\p{M}.']$`)
	phoneE164Pattern     = regexp.MustCompile(`^\+[1-9][0-9]{7,14}$`)
	countryCodePattern   = regexp.MustCompile(`^[A-Z]{2}$`)
	localePattern        = regexp.MustCompile(`^[a-z]{2,3}(?:-[A-Z]{2})?$`)
)

type memberProfile struct {
	AccountID         string    `json:"accountId"`
	MemberID          string    `json:"memberId"`
	LegalName         string    `json:"legalName"`
	PreferredName     string    `json:"preferredName"`
	Email             string    `json:"email"`
	PhoneE164         string    `json:"phoneE164"`
	CountryCode       string    `json:"countryCode"`
	VerificationLevel string    `json:"verificationLevel"`
	AccountStatus     string    `json:"accountStatus"`
	CreatedAt         time.Time `json:"createdAt"`
}

type memberSettings struct {
	Locale             string `json:"locale"`
	Timezone           string `json:"timezone"`
	ProductEmail       bool   `json:"productEmail"`
	TransactionalEmail bool   `json:"transactionalEmail"`
	ComplianceEmail    bool   `json:"complianceEmail"`
	SecurityEmail      bool   `json:"securityEmail"`
}

type currentTerms struct {
	ID            string     `json:"id"`
	Version       string     `json:"version"`
	Title         string     `json:"title"`
	ContentSHA256 string     `json:"contentSha256"`
	EffectiveAt   time.Time  `json:"effectiveAt"`
	Accepted      bool       `json:"accepted"`
	AcceptedAt    *time.Time `json:"acceptedAt,omitempty"`
}

func (s *Service) getProfile(w http.ResponseWriter, r *http.Request) {
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "profile unavailable")
		return
	}
	var result memberProfile
	err = s.db.QueryRow(r.Context(), `select a.id,m.id,m.full_name,coalesce(p.preferred_name,''),m.email,
		coalesce(p.phone_e164,''),coalesce(p.country_code,m.country_code,''),m.verification_level,m.account_status,m.created_at
		from platform.account a join identity.member m on m.id=a.member_id
		left join identity.member_profile p on p.member_id=m.id where a.id=$1`, acct.ID).Scan(
		&result.AccountID, &result.MemberID, &result.LegalName, &result.PreferredName, &result.Email,
		&result.PhoneE164, &result.CountryCode, &result.VerificationLevel, &result.AccountStatus, &result.CreatedAt,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "profile unavailable")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Service) updateProfile(w http.ResponseWriter, r *http.Request) {
	var input struct {
		PreferredName string `json:"preferredName"`
		PhoneE164     string `json:"phoneE164"`
		CountryCode   string `json:"countryCode"`
	}
	if err := decode(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid profile request")
		return
	}
	input.PreferredName = strings.TrimSpace(input.PreferredName)
	input.PhoneE164 = strings.TrimSpace(input.PhoneE164)
	input.CountryCode = strings.ToUpper(strings.TrimSpace(input.CountryCode))
	if !validOptionalPreferredName(input.PreferredName) || !validOptionalPhone(input.PhoneE164) || !validOptionalCountry(input.CountryCode) {
		writeError(w, http.StatusBadRequest, "invalid profile information")
		return
	}
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "profile unavailable")
		return
	}
	_, err = s.db.Exec(r.Context(), `insert into identity.member_profile(member_id,preferred_name,phone_e164,country_code)
		values($1,nullif($2,''),nullif($3,''),nullif($4,'')) on conflict(member_id) do update set
		preferred_name=excluded.preferred_name,phone_e164=excluded.phone_e164,country_code=excluded.country_code,updated_at=now()`,
		acct.MemberID, input.PreferredName, input.PhoneE164, input.CountryCode)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "profile could not be updated")
		return
	}
	_, _ = s.db.Exec(r.Context(), `insert into platform.activity_event(account_id,event_type,resource_type,resource_id,summary)
		values($1,'profile.updated','account',$1,'Account profile updated')`, acct.ID)
	s.getProfile(w, r)
}

func (s *Service) getSettings(w http.ResponseWriter, r *http.Request) {
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "settings unavailable")
		return
	}
	if err := s.ensureSettingsRows(r.Context(), acct.MemberID); err != nil {
		writeError(w, http.StatusInternalServerError, "settings unavailable")
		return
	}
	var result memberSettings
	err = s.db.QueryRow(r.Context(), `select p.locale,p.timezone,n.product_email,n.transactional_email,n.compliance_email,n.security_email
		from identity.member_profile p join notification.member_preference n on n.member_id=p.member_id where p.member_id=$1`, acct.MemberID).Scan(
		&result.Locale, &result.Timezone, &result.ProductEmail, &result.TransactionalEmail, &result.ComplianceEmail, &result.SecurityEmail,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "settings unavailable")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Service) updateSettings(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Locale       string `json:"locale"`
		Timezone     string `json:"timezone"`
		ProductEmail *bool  `json:"productEmail"`
	}
	if err := decode(r, &input); err != nil || input.ProductEmail == nil {
		writeError(w, http.StatusBadRequest, "invalid settings request")
		return
	}
	input.Locale = strings.TrimSpace(input.Locale)
	input.Timezone = strings.TrimSpace(input.Timezone)
	if !localePattern.MatchString(input.Locale) || !validTimezone(input.Timezone) {
		writeError(w, http.StatusBadRequest, "invalid locale or timezone")
		return
	}
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "settings unavailable")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "settings unavailable")
		return
	}
	defer tx.Rollback(r.Context())
	_, err = tx.Exec(r.Context(), `insert into identity.member_profile(member_id,locale,timezone) values($1,$2,$3)
		on conflict(member_id) do update set locale=excluded.locale,timezone=excluded.timezone,updated_at=now()`, acct.MemberID, input.Locale, input.Timezone)
	if err == nil {
		_, err = tx.Exec(r.Context(), `insert into notification.member_preference(member_id,product_email) values($1,$2)
			on conflict(member_id) do update set product_email=excluded.product_email,updated_at=now()`, acct.MemberID, *input.ProductEmail)
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `insert into platform.activity_event(account_id,event_type,resource_type,resource_id,summary)
			values($1,'settings.updated','account',$1,'Account settings updated')`, acct.ID)
	}
	if err != nil || tx.Commit(r.Context()) != nil {
		writeError(w, http.StatusInternalServerError, "settings could not be updated")
		return
	}
	s.getSettings(w, r)
}

func (s *Service) ensureSettingsRows(ctx context.Context, memberID string) error {
	if _, err := s.db.Exec(ctx, `insert into identity.member_profile(member_id) values($1) on conflict(member_id) do nothing`, memberID); err != nil {
		return err
	}
	_, err := s.db.Exec(ctx, `insert into notification.member_preference(member_id) values($1) on conflict(member_id) do nothing`, memberID)
	return err
}

func (s *Service) getCurrentTerms(w http.ResponseWriter, r *http.Request) {
	terms, err := s.currentTermsForSubject(r.Context(), currentIdentity(r).Subject)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "published terms unavailable")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "terms status unavailable")
		return
	}
	writeJSON(w, http.StatusOK, terms)
}

func (s *Service) acceptCurrentTerms(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Version  string `json:"version"`
		Accepted bool   `json:"accepted"`
	}
	if err := decode(r, &input); err != nil || !input.Accepted || strings.TrimSpace(input.Version) == "" {
		writeError(w, http.StatusBadRequest, "explicit terms acceptance required")
		return
	}
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "terms acceptance unavailable")
		return
	}
	defer tx.Rollback(r.Context())
	var documentID, version, digest string
	err = tx.QueryRow(r.Context(), `select id,version,content_sha256 from legal.document_version
		where document_type='terms_of_use' and status='published' and effective_at<=now() order by effective_at desc limit 1 for share`).Scan(&documentID, &version, &digest)
	if err != nil || version != strings.TrimSpace(input.Version) {
		writeError(w, http.StatusConflict, "terms version is no longer current")
		return
	}
	tag, err := tx.Exec(r.Context(), `insert into legal.member_acceptance(
		id,member_id,document_id,document_version,content_sha256,acceptance_source,correlation_id
	) values($1,$2,$3,$4,$5,'web',nullif($6,'')) on conflict(member_id,document_id) do nothing`,
		newID(), acct.MemberID, documentID, version, digest, currentCorrelationID(r.Context()))
	if err == nil && tag.RowsAffected() > 0 {
		_, err = tx.Exec(r.Context(), `insert into platform.activity_event(account_id,event_type,resource_type,resource_id,summary,metadata)
			values($1,'legal.terms.accepted','legal_document',$2,'Terms of Use accepted',$3)`, acct.ID, documentID, map[string]string{"version": version, "contentSha256": digest})
	}
	if err != nil || tx.Commit(r.Context()) != nil {
		writeError(w, http.StatusInternalServerError, "terms acceptance could not be recorded")
		return
	}
	terms, err := s.currentTermsForSubject(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "terms status unavailable")
		return
	}
	writeJSON(w, http.StatusOK, terms)
}

func (s *Service) currentTermsForSubject(ctx context.Context, subject string) (currentTerms, error) {
	var result currentTerms
	err := s.db.QueryRow(ctx, `select d.id,d.version,d.title,d.content_sha256,d.effective_at,
		(a.id is not null),a.accepted_at from legal.document_version d
		join platform.account pa on pa.auth_subject=$1 join identity.member m on m.id=pa.member_id
		left join legal.member_acceptance a on a.member_id=m.id and a.document_id=d.id
			and a.document_version=d.version and a.content_sha256=d.content_sha256
		where d.document_type='terms_of_use' and d.status='published' and d.effective_at<=now()
		order by d.effective_at desc limit 1`, subject).Scan(
		&result.ID, &result.Version, &result.Title, &result.ContentSHA256, &result.EffectiveAt, &result.Accepted, &result.AcceptedAt,
	)
	return result, err
}

func (s *Service) termsAcceptanceRequired(ctx context.Context, subject string) (bool, error) {
	terms, err := s.currentTermsForSubject(ctx, subject)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return !terms.Accepted, err
}

func termsGateExempt(path string) bool {
	return path == "/v1/account" || path == "/v1/profile" || path == "/v1/settings" ||
		path == "/v1/legal/terms/current" || path == "/v1/legal/terms/acceptance"
}

func validOptionalPreferredName(value string) bool {
	return value == "" || (len([]rune(value)) >= 2 && len([]rune(value)) <= 80 && preferredNamePattern.MatchString(value))
}

func validOptionalPhone(value string) bool {
	return value == "" || phoneE164Pattern.MatchString(value)
}

func validOptionalCountry(value string) bool {
	return value == "" || countryCodePattern.MatchString(value)
}

func validTimezone(value string) bool {
	if len(value) < 3 || len(value) > 64 {
		return false
	}
	_, err := time.LoadLocation(value)
	return err == nil
}
