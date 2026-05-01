package config

import (
	"bufio"
	"os"
	"strings"
)

type Config struct {
	Port         string
	ClientOrigin string
	JWTSecret    string
	Database     Database
}

type Database struct {
	Driver string
	DSN    string
}

func Load() Config {
	loadDotEnv(".env")

	return Config{
		Port:         getEnv("PORT", "8080"),
		ClientOrigin: getEnv("CLIENT_ORIGIN", "http://localhost:3000"),
		JWTSecret:    getEnv("JWT_SECRET", "dev-only-change-me"),
		Database: Database{
			Driver: getEnv("DB_DRIVER", "sqlite"),
			DSN:    getEnv("DB_DSN", "data/beacon.db"),
		},
	}
}

func getEnv(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
}

func loadDotEnv(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}

		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if key == "" || os.Getenv(key) != "" {
			continue
		}

		_ = os.Setenv(key, value)
	}
}
