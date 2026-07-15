package main

import "testing"

func TestListenAddress(t *testing.T) {
	t.Setenv("PLATFORM_LISTEN_ADDR", "")
	t.Setenv("PORT", "")
	if got := listenAddress(); got != "127.0.0.1:8080" {
		t.Fatalf("default address = %q", got)
	}

	t.Setenv("PORT", "9000")
	if got := listenAddress(); got != ":9000" {
		t.Fatalf("Vercel address = %q", got)
	}

	t.Setenv("PLATFORM_LISTEN_ADDR", "0.0.0.0:7000")
	if got := listenAddress(); got != "0.0.0.0:7000" {
		t.Fatalf("explicit address = %q", got)
	}
}
