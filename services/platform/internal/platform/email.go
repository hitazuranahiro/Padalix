package platform

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	"github.com/aws/aws-sdk-go-v2/service/sesv2/types"
)

type emailSender interface {
	Send(context.Context, notificationJob) (string, error)
}

type webhookEmailSender struct {
	client *http.Client
	url    string
	token  string
	from   string
}

type sesEmailClient interface {
	SendEmail(context.Context, *sesv2.SendEmailInput, ...func(*sesv2.Options)) (*sesv2.SendEmailOutput, error)
}

type sesEmailSender struct {
	client           sesEmailClient
	from             string
	configurationSet string
}

func newEmailSender(ctx context.Context, config WorkerConfig, httpClient *http.Client) (emailSender, error) {
	switch config.EmailProvider {
	case "webhook":
		return &webhookEmailSender{client: httpClient, url: config.EmailProviderURL, token: config.EmailProviderToken, from: config.EmailFrom}, nil
	case "ses":
		awsConfig, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(config.EmailAWSRegion))
		if err != nil {
			return nil, fmt.Errorf("load AWS email configuration: %w", err)
		}
		if _, err := awsConfig.Credentials.Retrieve(ctx); err != nil {
			return nil, fmt.Errorf("load AWS email credentials: %w", err)
		}
		return &sesEmailSender{client: sesv2.NewFromConfig(awsConfig), from: config.EmailFrom, configurationSet: config.EmailConfigurationSet}, nil
	default:
		return nil, fmt.Errorf("unsupported email provider %q", config.EmailProvider)
	}
}

func (s *webhookEmailSender) Send(ctx context.Context, job notificationJob) (string, error) {
	body, err := json.Marshal(map[string]any{
		"from": s.from, "to": job.Recipient, "category": job.Category,
		"template": job.TemplateKey, "payload": job.Payload,
	})
	if err != nil {
		return "", err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, s.url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	request.Header.Set("Authorization", "Bearer "+s.token)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", job.IdempotencyKey)
	response, err := s.client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", fmt.Errorf("email provider returned %d", response.StatusCode)
	}
	var result struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 64<<10)).Decode(&result); err != nil || strings.TrimSpace(result.ID) == "" {
		return "", errors.New("email provider response omitted message id")
	}
	return result.ID, nil
}

func (s *sesEmailSender) Send(ctx context.Context, job notificationJob) (string, error) {
	subject, textBody, htmlBody := renderEmail(job)
	digest := sha256.Sum256([]byte(job.IdempotencyKey))
	input := &sesv2.SendEmailInput{
		FromEmailAddress: aws.String(s.from),
		Destination:      &types.Destination{ToAddresses: []string{job.Recipient}},
		Content: &types.EmailContent{Simple: &types.Message{
			Subject: &types.Content{Data: aws.String(subject), Charset: aws.String("UTF-8")},
			Body: &types.Body{
				Text: &types.Content{Data: aws.String(textBody), Charset: aws.String("UTF-8")},
				Html: &types.Content{Data: aws.String(htmlBody), Charset: aws.String("UTF-8")},
			},
		}},
		EmailTags: []types.MessageTag{{Name: aws.String("padalix-idempotency"), Value: aws.String(hex.EncodeToString(digest[:]))}},
	}
	if s.configurationSet != "" {
		input.ConfigurationSetName = aws.String(s.configurationSet)
	}
	output, err := s.client.SendEmail(ctx, input)
	if err != nil {
		return "", fmt.Errorf("send SES email: %w", err)
	}
	if output.MessageId == nil || strings.TrimSpace(*output.MessageId) == "" {
		return "", errors.New("SES response omitted message id")
	}
	return *output.MessageId, nil
}

func renderEmail(job notificationJob) (string, string, string) {
	subjects := map[string]string{
		"customer.email_verification":      "Verify your Padalix email",
		"customer.password_reset":          "Reset your Padalix password",
		"customer.password_changed":        "Your Padalix password was changed",
		"kyc_submission_received":          "We received your verification submission",
		"kyc_case_submitted":               "New KYC case awaiting review",
		"stellar_transfer_confirmed_v1":    "Your Padalix transfer is confirmed",
		"stellar_transfer_failed_v1":       "Your Padalix transfer could not be completed",
		"support_ticket_created_v1":        "Your Padalix support request was received",
		"support_ticket_status_updated_v1": "Your Padalix support request was updated",
	}
	subject := subjects[job.TemplateKey]
	if subject == "" {
		subject = "Padalix account notification"
	}
	keys := make([]string, 0, len(job.Payload))
	for key := range job.Payload {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var textDetails strings.Builder
	var htmlDetails strings.Builder
	for _, key := range keys {
		value := fmt.Sprint(job.Payload[key])
		label := strings.ReplaceAll(key, "_", " ")
		textDetails.WriteString(fmt.Sprintf("%s: %s\n", label, value))
		escapedValue := html.EscapeString(value)
		if parsed, err := url.Parse(value); err == nil && parsed.Scheme == "https" && parsed.Host != "" {
			escapedValue = `<a href="` + html.EscapeString(value) + `">Open secure link</a>`
		}
		htmlDetails.WriteString("<tr><th align=\"left\" style=\"padding:6px 12px 6px 0\">" + html.EscapeString(label) + "</th><td style=\"padding:6px 0\">" + escapedValue + "</td></tr>")
	}
	textBody := "Padalix\n\n" + subject + "\n\n" + textDetails.String() + "\nThis is an automated transactional message."
	htmlBody := `<!doctype html><html><body style="margin:0;background:#f4f4f2;color:#111;font-family:Arial,sans-serif"><div style="max-width:620px;margin:auto;padding:32px"><div style="background:#050505;color:#fff;padding:20px;font-weight:700">PADALIX</div><main style="background:#fff;padding:28px"><h1 style="font-size:24px;margin:0 0 20px">` + html.EscapeString(subject) + `</h1><table style="border-collapse:collapse;width:100%">` + htmlDetails.String() + `</table><p style="color:#666;font-size:12px;margin-top:28px">This is an automated transactional message.</p></main></div></body></html>`
	return subject, textBody, htmlBody
}
