import json
from pathlib import Path
import psycopg2
from psycopg2 import Error

# Connect to an existing database
connection = psycopg2.connect(user="postgres",
                              password="Postgres2022!",
                              host="127.0.0.1",
                              port="5432",
                              database="scrapjobs")
# Create a cursor to perform database operations cursor = connection.cursor()
# Print PostgreSQL details
print("PostgreSQL server information")
print(connection.get_dsn_parameters(), "\n")
cursor = connection.cursor()
# Executing a SQL query
cursor.execute("SELECT version();")
# Fetch result
record = cursor.fetchone()
print("You are connected to - ", record, "\n")

cursor.execute("TRUNCATE jobs")
print("Truncated jobs")

## cursor.execute("""
##     ALTER TABLE jobs ADD COLUMN IF NOT EXISTS descrip_fts tsvector GENERATED ALWAYS AS
##     (to_tsvector('english', descrip)) STORED;""")
## cursor.execute("""
##    create index descrip_fts_idx on jobs using gin(descrip_fts);
##     """) 

files = sorted(Path("./output/").glob("*.json"))
for file in files:
    data = json.loads(file.read_text())
    print(f"Inserting {data['title']}")
    cursor.execute("INSERT INTO jobs (title, descrip, url, tags) VALUES(%s, %s, %s, %s)", (data["title"], data["descrip"], data["url"], data["tags"]))
    connection.commit()
    print(f"inserted {data['title']}")
