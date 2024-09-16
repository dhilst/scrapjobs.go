package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"

	// "database.sql"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

var db *sql.DB
var err error

type dbConfigT struct {
	PostgresDriver string
	User           string
	Host           string
	Port           string
	Password       string
	DbName         string
	TableName      string
}

var dbConfig = dbConfigT{
	PostgresDriver: "postgres",
	User:           "postgres",
	Host:           "localhost",
	Port:           "5432",
	Password:       "Postgres2022!",
	DbName:         "scrapjobs",
	TableName:      "scrapjobs",
}

var DataSourceName = fmt.Sprintf("host=%s port=%s user=%s "+
	"password=%s dbname=%s sslmode=disable", dbConfig.Host, dbConfig.Port, dbConfig.User, dbConfig.Password, dbConfig.DbName)

func GetVersion() (*string, error) {
	sqlStatement, err := db.Query("SELECT version()")
	if err != nil {
		return nil, err
	}
	for sqlStatement.Next() {
		var version string
		err = sqlStatement.Scan(&version)
		if err != nil {
			return nil, err
		}
		return &version, nil
	}
	return nil, fmt.Errorf("unreacheable")

}

type SearchResult struct {
	Title    string
	Tags     []string
	Url      string
	Rank     float32
	Headline string
}

func SearchJobs(conn *pgxpool.Pool, query string) (*[]SearchResult, error) {
	var results []SearchResult

	rows, err := conn.Query(context.Background(),
		`
		select
		  title,
		  tags,
		  url,
		  ts_rank_cd(descrip_fts, query) as rank,
		  ts_headline('english', descrip, query)
		from jobs,
		  websearch_to_tsquery('english', $1) query
		where descrip_fts @@ query
		  and ts_rank_cd(descrip_fts, query) > 0.001
		order by rank desc;
		`, query)

	if err == pgx.ErrNoRows {
		return &results, nil
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "QueryRow failed: %v\n", err)
		return nil, err
	}

	for rows.Next() {
		var result SearchResult
		rows.Scan(
			&result.Title,
			&result.Tags,
			&result.Url,
			&result.Rank,
			&result.Headline,
		)
		results = append(results, result)
	}

	return &results, nil
}

func NthOrDefault[T any](ar []T, i int, def T) T {
	if i >= len(ar) {
		return def
	}

	return ar[i]
}

type getJobsRequest struct {
	Query string `json:"query"`
}

func getJobsHandler(conn *pgxpool.Pool) func(*gin.Context) {
	return func(c *gin.Context) {
		var requestBody getJobsRequest
		if err := c.BindJSON(&requestBody); err != nil {
			log.Printf("ERROR %s", err)
			return
		}

		conn, err := pgxpool.New(context.Background(), DataSourceName)
		if err != nil {
			log.Panic(err)
		}
		defer conn.Close()
		fmt.Printf("Connected!!!\n")

		results, err := SearchJobs(conn, requestBody.Query)
		if err != nil {
			log.Panic(err)
		}

		c.IndentedJSON(http.StatusOK, results)
	}
}

func main() {
	log.Printf("Accessing %s ... ", dbConfig.DbName)
	dbpool, err := pgxpool.New(context.Background(), DataSourceName)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to create connection pool: %v\n", err)
		os.Exit(1)
	}
	defer dbpool.Close()

	var version string
	err = dbpool.QueryRow(context.Background(),
		"select version()").Scan(&version)
	if err != nil {
		fmt.Fprintf(os.Stderr, "QueryRow failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Version: %s\n", version)
	defer dbpool.Close()

	// HTTP server setup
	router := gin.Default()
	router.POST("/jobs", getJobsHandler(dbpool))
	// Serve HTML page to trigger connection
	router.GET("/ws/client", func(c *gin.Context) {
		c.File("index.html")
	})

	router.GET("/ws/server", func(c *gin.Context) {
		client, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("%s, error while Upgrading websocket connection\n",
				err.Error())
			c.AbortWithError(http.StatusInternalServerError, err)
			return
		}

		for {
			// Read message from client
			var v getJobsRequest
			err := client.ReadJSON(&v)
			if err != nil {
				log.Printf("%s error while reading websocket message\n", err.Error())
				c.AbortWithError(http.StatusInternalServerError, err)
			}

			results, err := SearchJobs(dbpool, v.Query)
			if err != nil {
				log.Printf("%s error\n", err)
				c.AbortWithError(http.StatusInternalServerError, err)
				break
			}

			// Echo message back to client
			err = client.WriteJSON(results)
			if err != nil {
				log.Printf("%s, error while writing message\n", err.Error())
				c.AbortWithError(http.StatusInternalServerError, err)
				break
			}
		}

	})

	router.Run("localhost:8080")

}
