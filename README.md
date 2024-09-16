# scrapjobs

This is a solution to download jobs offers from multiple sources locally into a
PostgreSQL and then use full-text search to look into the data using websocket
and raw HTML/CSS + javascript interactive search.

_Add - before a term to exclude it from the results_

![scrapjobs demo](images/scrapjobs.gif)

The search is triggered on key pressed and throttled to preserve the backend.
On the backend we simply execute the search and return the results as JSON. In
the frontend again we swap generate HTML dynamically and replace `.innerHTML`,
nothing new.

## The data ETL

To populate the database I downloaded the jobs from public available sources,
I didn't used any authenticated session to download the data, the datata is not
shared in the repository for obvious reasons anyway.

To download the data I do it in 3 steps:

1. You get a list of links of the jobs to be scrapped and save it in a file
   like `links.json`, this file is a big list of links, nothing else. Usually
   is trivial to get this list of links.
2. Write a scrapper for the links in `links.json`, the code for the scrappers
   live at `scrap.mjs`. The scrapper should write a file like
   `outputs/SomeCool_Job_Position.json` being an object with 4 keys `title`,
   `url`, `descrip` and `tags`. The first 3 comes from the job vacancy page,
   `descrip` is the text with the vacancy data. `tags` is a list of tags
   passed from the command line.
   - You can run the scrapper with the command `node scrap.mjs downloadJobs golangprojects_com.json go golangprojects`
3. Load the files in the database. There is a `insert_txt.py` script for that
   purpose.

## The Backend

The backend lives in `backend/web-service-gin` folder. I'm using gin framework.
The backend has only one endpoints where the user can send a query or the websocket
at `/ws/server`. The `/ws/client` loads `index.html` a pure HTML client that
render searches interactively.
