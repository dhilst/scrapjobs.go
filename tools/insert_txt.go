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

var fromFlag *string = flag.String("from", "", "Insert from this folder")
var truncateFlag *bool = flag.Bool("truncate-table", false, "Truncate the table before inserting the new data")

func orDefault(s, def string) string {
	if s == "" {
		return def
	}

	return s
}

type Jobs struct {
	Title    string            `json:"title"`
	Descrip  string            `json:"descrip"`
	Url      string            `json:"url"`
	Tags     []string          `json:"tags"`
	Metadata map[string]string `json:"metadata"`
}

func readJobs() *[]Jobs {
	var err error
	var jsonFiles []string
	var jobs []Jobs

	if *fromFlag != "" {
		jsonFiles, err = filepath.Glob(fmt.Sprintf("%s/*.json", *fromFlag))
		if err != nil {
			panic(err)
		}
		jobs = make([]Jobs, len(jsonFiles))
	} else {
		// Read json from stdin
		bytes, err := io.ReadAll(os.Stdin)
		if err != nil {
			panic(err)
		}
		if err := json.Unmarshal(bytes, &jobs); err != nil {
			panic(err)
		}
	}

	for i, val := range jsonFiles {
		jsonFile, err := os.Open(val)
		if err != nil {
			log.Printf("JSON file error: %s: '%s'\n", err, val)
			continue
		}
		defer jsonFile.Close()
		bytes, err := io.ReadAll(jsonFile)
		if err := json.Unmarshal(bytes, &jobs[i]); err != nil {
			panic(err)
		}
	}

	return &jobs
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
		log.Fatalf("QueryRow failed: %v\n", err)
	}
	fmt.Printf("Version: %s\n", version)
	defer conn.Close(context.Background())

	// Truncate the table
	if *truncateFlag {
		log.Printf("Truncating the table")
		_, err = conn.Exec(context.Background(), "truncate table jobs")
	}

	for _, data := range *readJobs() {
		// Append the *new* tag for the new imported data
		var tags = append(data.Tags, "new")

		conn.Exec(context.Background(),
			`INSERT INTO jobs (title, descrip, url, tags, metadata)
 			VALUES($1, $2, $3, $4, $5)
			ON CONFLICT (url) DO UPDATE
			SET title = $1,
				descrip = $2,
				tags = $4,
			    metadata = $5
			`,
			data.Title, data.Descrip, data.Url, tags, data.Metadata)

		fmt.Println(data.Title, "inserted")
	}

	os.Exit(0)
}
