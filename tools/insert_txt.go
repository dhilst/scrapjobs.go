package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"

	"github.com/jackc/pgx/v5"
)

var DATABASE_URL string = orDefault(
	os.Getenv("DATABASE_URL"),
	"postgres://postgres:Postgres2022!@localhost:5432/scrapjobs")

// var nFlag *int = flag.Int("n", 1234, "help message for flag n")

func orDefault(s, def string) string {
	if s == "" {
		return def
	}

	return s
}

func main() {
	flag.Parse()

	conn, err := pgx.Connect(context.Background(), DATABASE_URL)
	if err != nil {
		panic(err)
	}
	log.Printf("Connected!!!\n")

	var version string
	err = conn.QueryRow(context.Background(),
		"select version()").Scan(&version)
	if err != nil {
		fmt.Fprintf(os.Stderr, "QueryRow failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Version: %s\n", version)
	defer conn.Close(context.Background())

	var matches []string
	if matches, err = filepath.Glob("../output/*.json"); err != nil {
		panic(err)
	}
	for _, val := range matches {
		jsonFile, err := os.Open(val)
		if err != nil {
			continue
		}
		defer jsonFile.Close()

		type Jobs struct {
			Title   string   `json:"title"`
			Descrip string   `json:"descrip"`
			Url     string   `json:"url"`
			Tags    []string `json:"tags"`
		}

		bytes, err := io.ReadAll(jsonFile)
		var data Jobs
		json.Unmarshal(bytes, &data)

		conn.Exec(context.Background(),
			"INSERT INTO jobs (title, descrip, url, tags) VALUES($1, $2, $3, $4)",
			data.Title, data.Descrip, data.Url, data.Tags)

		fmt.Println(data.Title, "inserted")
	}

	os.Exit(0)

	// cleanup the jobs table
	//conn.Exec(context.Background(),
	//	"truncate jobs")

}
