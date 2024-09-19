package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	// "database.sql"
	"github.com/gin-gonic/autotls"
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

var databaseUrl = flag.String("db", "postgres://postgres:Postgres2022!@localhost/scrapjobs", "Database URL to connect")
var httpPort = flag.String("port", "8080", "HTTP port to bind to")

func GetEnvOrDef(env string, def string) string {
	if val := os.Getenv(env); val != "" {
		return val
	}
	return def
}

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

func SearchJobs(conn *pgxpool.Pool, terms []string, tags []string) (*[]SearchResult, error) {
	var results []SearchResult
	if len(terms)+len(tags) == 0 {
		// Search for nothing
		return &results, nil
	}

	var rows pgx.Rows
	// I couldn't make this work with a single query
	// `$2 <@ tags` does not work as expected when tags = []
	if len(terms) == 0 && len(tags) > 0 {
		// Search for tags only
		rows, err = conn.Query(context.Background(),
			`
			select
			  title,
			  tags,
			  url,
			  1 as rank,
			  '' as headline
			from jobs,
			  websearch_to_tsquery('english', $1) query
			where $2 <@ tags
			order by rank desc
			limit 100
			`,
			strings.Join(terms, " "),
			tags,
		)
	} else if len(terms) > 0 && len(tags) == 0 {
		// Search for terms only
		rows, err = conn.Query(context.Background(),
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
			order by rank desc
			limit 100
			`,
			strings.Join(terms, " "),
		)
	} else if len(terms) > 0 && len(tags) > 0 {
		// Search for terms and tags
		rows, err = conn.Query(context.Background(),
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
			  and $2 <@ tags
			order by rank desc
			limit 100
			`,
			strings.Join(terms, " "),
			tags,
		)
	}

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

		fmt.Printf("Connected!!!\n")

		results, err := SearchJobs(conn, strings.Fields(requestBody.Query), make([]string, 0))
		if err != nil {
			log.Panic(err)
		}

		c.IndentedJSON(http.StatusOK, results)
	}
}

func main() {
	flag.Parse()

	dbpool, err := pgxpool.New(context.Background(), *databaseUrl)
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
	router.GET("/", func(c *gin.Context) {
		c.File("index.html")
	})
	// Ping handler
	router.GET("/ping", func(c *gin.Context) {
		c.String(http.StatusOK, "pong")
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

			var terms []string
			var tags []string
			for _, token := range strings.Fields(v.Query) {
				if strings.HasPrefix(token, "#") {
					tags = append(tags, token[1:])
				} else {
					terms = append(terms, token)
				}
			}

			results, err := SearchJobs(dbpool, terms, tags)
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

	if *httpPort == "8080" {
		runDev(router)
	} else {
		runProd(router)
	}
}

func runProd(router *gin.Engine) {
	// blocks forever
	log.Fatal(autotls.Run(router, "scrapjobs.xyz"))
}

func runDev(router *gin.Engine) {
	// blocks forever
	log.Fatal(router.Run(fmt.Sprintf("0.0.0.0:%s", *httpPort)))
}
