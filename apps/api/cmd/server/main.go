package main

import (
	"log"
	"net/http"

	"github.com/beacon-team/beacon/apps/api/internal/config"
	"github.com/beacon-team/beacon/apps/api/internal/database"
	"github.com/beacon-team/beacon/apps/api/internal/httpapi"
)

func main() {
	cfg := config.Load()

	db, err := database.Open(cfg.Database)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}

	server := httpapi.NewServer(db, cfg)
	addr := ":" + cfg.Port

	log.Printf("Beacon API listening on %s", addr)
	if err := http.ListenAndServe(addr, server.Routes()); err != nil {
		log.Fatal(err)
	}
}
