package main

import (
	"bufio"
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
		log.Fatalf("QueryRow failed: %v\n", err)
	}
	fmt.Printf("Version: %s\n", version)
	defer conn.Close(context.Background())

	// Remove the *new* tag from the jobs in the database
	// _, err = conn.Exec(context.Background(), "update jobs set tags = array_remove(tags, 'new')")

	var jsonFiles []string
	if *fromFlag != "" {
		jsonFiles, err = filepath.Glob(fmt.Sprintf("%s/*.json", *fromFlag))
		if err != nil {
			panic(err)
		}
	} else {
		reader := bufio.NewReader(os.Stdin)
		bytes, err := io.ReadAll(reader)
		if err != nil {
			panic(err)
		}
		json.Unmarshal(bytes, &jsonFiles)
	}

	for _, val := range jsonFiles {
		jsonFile, err := os.Open(val)
		if err != nil {
			log.Printf("JSON file error: %s: '%s'\n", err, val)
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

		// Append the *new* tag for the new imported data
		var tags = append(data.Tags, "new")

		conn.Exec(context.Background(),
			"INSERT INTO jobs (title, descrip, url, tags) VALUES($1, $2, $3, $4) ON CONFLICT (url) DO NOTHING",
			data.Title, data.Descrip, data.Url, tags)

		fmt.Println(data.Title, "inserted")
	}

	os.Exit(0)
}
