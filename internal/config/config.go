package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	HTTPAddr       string
	PublicBaseURL  string
	DatabaseURL    string
	LocalUserEmail string
	LocalUserName  string

	AnthropicAPIKey string

	// Path to a JSON file with browser session credentials for
	// calling Chat's private batchexecute RPCs from the backend
	// (style corpus sync). Empty = feature disabled.
	ChatSessionFile string
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{
		HTTPAddr:        getenv("HTTP_ADDR", ":8080"),
		PublicBaseURL:   getenv("PUBLIC_BASE_URL", "http://localhost:8080"),
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		LocalUserEmail:  getenv("LOCAL_USER_EMAIL", "local-extension-user@localhost"),
		LocalUserName:   getenv("LOCAL_USER_NAME", "Local Extension User"),
		AnthropicAPIKey: os.Getenv("ANTHROPIC_API_KEY"),
		ChatSessionFile: os.Getenv("CHAT_SESSION_FILE"),
	}

	var missing []string
	if cfg.DatabaseURL == "" {
		missing = append(missing, "DATABASE_URL")
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("missing required env vars: %s", strings.Join(missing, ", "))
	}

	return cfg, nil
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
