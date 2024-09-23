"""
This code is copied from metadata.ipynb and adapted
to run as a pipeline step.

Input (stdin): A json with the jobs and metadata
Output (stdou): A json with the jobs and more metadata

This script must preserve metadata coming from the scrappers
and enrich it based on the text in the description.
"""
import sys
import json
import pandas as pd
import spacy
from spacy import displacy 
from spacy.matcher import Matcher
from pathlib import Path
import operator as op

data = json.loads(sys.stdin.read())
df = pd.DataFrame(data, columns=["tags", "descrip", "title", "url", "file", "metadata"])
df.metadata = df.metadata.apply(lambda x: {} if pd.isna(x) else x)

nlp = spacy.load("en_core_web_sm")

location_mat = Matcher(nlp.vocab)
location_pats = [
    [{"ENT_TYPE": "LOC"}],
    [{"ENT_TYPE": "NORP"}],
    [{"ENT_TYPE": "GPE"}],
    [{"ENT_TYPE": "TIME"}],
    [{"LOWER": "worldwide"}],
]
location_mat.add("LOCATION", location_pats)
remote_mat = Matcher(nlp.vocab)
remote_pats = [
    [{"LOWER": "remote"}],
]
remote_mat.add("REMOTE", remote_pats)

def collect_matcher(m, doc, window=0):
    return [doc[s-window:e+window].as_doc() for _, s, e in m(doc)]

def add_remote_metadata(row):
    # Do not overwrite the scrapper
    if "remote" in row.metadata:
        return row.metadata
        
    doc = nlp(row.descrip)
    # Find remote word
    remotes = collect_matcher(remote_mat, doc, 5)
    if remotes:
        locations = set(str(l).strip() for doc in remotes for l in collect_matcher(location_mat, doc))
        if locations:
            print("New remote location found", row.title, locations, file=sys.stderr)
            return {
                **row.metadata,
                "remote": " ".join(sorted(map(str, locations))).strip()
            }
    return row.metadata

df["metadata"] = df.apply(add_remote_metadata, axis=1)

json_out = []
for _, row in df.iterrows():
    json_out.append({ 
        "title": row.title,
        "descrip": row.descrip,
        "url": row.url,
        "tags": row.tags,
        "metadata": row.metadata
    })

print(json.dumps(json_out, indent=2))
