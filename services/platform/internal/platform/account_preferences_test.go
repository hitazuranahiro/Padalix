package platform

import "testing"

func TestProfileValidation(t *testing.T) {
	for _, value := range []string{"", "Hiro", "Maria Dela Cruz", "Anne-Marie", "José"} {
		if !validOptionalPreferredName(value) {
			t.Errorf("expected preferred name %q to be valid", value)
		}
	}
	for _, value := range []string{"A", " leading", "name@example.com", "<script>"} {
		if validOptionalPreferredName(value) {
			t.Errorf("expected preferred name %q to be invalid", value)
		}
	}
	for _, value := range []string{"", "+639171234567", "+12025550123"} {
		if !validOptionalPhone(value) {
			t.Errorf("expected phone %q to be valid", value)
		}
	}
	for _, value := range []string{"09171234567", "+0123456789", "+63917"} {
		if validOptionalPhone(value) {
			t.Errorf("expected phone %q to be invalid", value)
		}
	}
}

func TestSettingsValidation(t *testing.T) {
	for _, value := range []string{"Asia/Manila", "UTC", "America/New_York"} {
		if !validTimezone(value) {
			t.Errorf("expected timezone %q to be valid", value)
		}
	}
	for _, value := range []string{"", "Manila", "../../etc/passwd"} {
		if validTimezone(value) {
			t.Errorf("expected timezone %q to be invalid", value)
		}
	}
	for _, value := range []string{"en", "en-PH", "fil-PH"} {
		if !localePattern.MatchString(value) {
			t.Errorf("expected locale %q to be valid", value)
		}
	}
}

func TestTermsGateExemptionsAreNarrow(t *testing.T) {
	for _, path := range []string{"/v1/account", "/v1/profile", "/v1/settings", "/v1/legal/terms/current", "/v1/legal/terms/acceptance"} {
		if !termsGateExempt(path) {
			t.Errorf("expected %q to be exempt", path)
		}
	}
	for _, path := range []string{"/v1/dashboard", "/v1/transfers", "/v1/profile/export", "/v1/legal/terms/current/other"} {
		if termsGateExempt(path) {
			t.Errorf("expected %q to require acceptance", path)
		}
	}
}
