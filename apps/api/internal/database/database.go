package database

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/beacon-team/beacon/apps/api/internal/config"
	"github.com/beacon-team/beacon/apps/api/internal/models"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Open(cfg config.Database) (*gorm.DB, error) {
	var dialector gorm.Dialector

	switch strings.ToLower(cfg.Driver) {
	case "", "sqlite", "sqlite3":
		if err := ensureSQLiteDir(cfg.DSN); err != nil {
			return nil, err
		}
		dialector = sqlite.Open(cfg.DSN)
	case "mysql":
		dialector = mysql.Open(cfg.DSN)
	case "postgres", "postgresql", "pg":
		dialector = postgres.Open(cfg.DSN)
	default:
		return nil, fmt.Errorf("unsupported DB_DRIVER %q", cfg.Driver)
	}

	db, err := gorm.Open(dialector, &gorm.Config{
		Logger: logger.New(
			log.New(os.Stdout, "\r\n", log.LstdFlags),
			logger.Config{
				SlowThreshold:             time.Second,
				LogLevel:                  logger.Warn,
				IgnoreRecordNotFoundError: true,
				Colorful:                  true,
			},
		),
	})
	if err != nil {
		return nil, err
	}

	if err := db.AutoMigrate(
		&models.User{},
		&models.Workspace{},
		&models.WorkspaceMember{},
		&models.Board{},
		&models.List{},
		&models.Card{},
		&models.Label{},
		&models.Checklist{},
		&models.ChecklistItem{},
		&models.Comment{},
		&models.Activity{},
	); err != nil {
		return nil, err
	}

	return db, nil
}

func ensureSQLiteDir(dsn string) error {
	if dsn == "" || dsn == ":memory:" || strings.HasPrefix(dsn, "file:") {
		return nil
	}

	dir := filepath.Dir(dsn)
	if dir == "." || dir == "" {
		return nil
	}

	return os.MkdirAll(dir, 0o755)
}
