import sqlite3
from pymongo import MongoClient

# ========= CONFIG =========
SQLITE_PATH = "db.sqlite3"      # Path to your extracted SQLite DB
MONGO_URI = "mongodb://localhost:27017/"
MONGO_DB_NAME = "nft-minter"    # Your existing MongoDB DB
# ==========================

# Connect to SQLite
conn = sqlite3.connect(SQLITE_PATH)
cursor = conn.cursor()

# Connect to MongoDB
client = MongoClient(MONGO_URI)
db = client[MONGO_DB_NAME]

# Get all SQLite tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [t[0] for t in cursor.fetchall()]

print(f"Found tables: {tables}")

# Loop through tables and insert data
for table in tables:
    cursor.execute(f"SELECT * FROM {table}")
    rows = cursor.fetchall()

    col_names = [desc[0] for desc in cursor.description]
    docs = [dict(zip(col_names, row)) for row in rows]

    if docs:
        # ✅ Only insert, don’t delete existing Mongo collections
        db[table].insert_many(docs)
        print(f"Inserted {len(docs)} rows into collection '{table}'")

conn.close()
print("✅ Data migration completed!")
