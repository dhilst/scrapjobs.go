# scrapjobs

This is a solution to download jobs offers from multiple sources locally into a
PostgreSQL and then use full-text search to look into the data using websocket
and raw HTML/CSS + javascript interactive search.

The user can search for keywords interactively, search for words or exclude
words from the results by prefixing they with `-` like `-java` to exclude
java from the results. Full-text search will exclude words like `the`, `of`, `a`,
these are known as [stop words](https://www.postgresql.org/docs/current/textsearch-dictionaries.html#TEXTSEARCH-STOPWORDS).
![scrapjobs demo](images/scrapjobs.gif)

The search is triggered on key pressed and throttled to preserve the backend.
On the backend we simply execute the search and return the results as JSON. In
the frontend again we swap generate HTML dynamically and replace `.innerHTML`,
nothing new.

## The data ETL

To populate the database I downloaded the jobs from public available sources,
I didn't used any authenticated session to download the data, the datata is not
shared in the repository for obvious reasons anyway.

To download the data I do it in 3 steps, each step receives the output of
the previous step. All steps outputs are in JSON.

1. Run the getLinks scrapper: `node scrap.mjs getLinks rustjobs`. This scrapper
   outptus a list of links in JSON format. It must open the browser, get the
   links and output as JSON.
2. Run the dowloadData scrapper` .. links json .. | node scrap downloadLinks
 rustjobs rust rustjobs othertag`. This scrapper get the links from the
   previous step, download the data from each link and save in the `output/.`
   folder. It outputs the files saved as a JSON string array
3. Run the importer. ` .. output json files .. | (cd tools/; go run .)` This is not a scrapper. It reads
   the list of files generated in the previous step and load it into the
   database. The `new` tag is cleared for old entries, and new entries are
   inserted with the `new` tag setted.

Running all steps at once:

```
node scrap.mjs getLinks rustjobs | \
  node scrap downloadLinks rustjobs rust rustjobs othertag \
  (cd tools/; go run .)
```

This will scrap and insert new entries in the database, updating the
`new` tags accordingly.

## The Backend

The backend lives in `backend/web-service-gin` folder. I'm using gin framework.
The backend has only one endpoints where the user can send a query or the websocket
at `/ws/server`. The `/ws/client` loads `index.html` a pure HTML client that
render searches interactively.
