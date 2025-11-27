## 🚀 NFT-Minter – Full‑Stack NFT Marketplace (ERC721)

Production‑ready monorepo for an NFT marketplace with:
- Django REST API (SQLite by default)
- React + Vite + TypeScript frontend
- Hardhat + Solidity smart contract (Sepolia ready)

The project supports minting, listing flags, likes, activity feeds, user profiles with media uploads, collection stats, and basic blockchain sync hooks.

### 🧰 Tech Stack
- Backend: Django 5, Django REST Framework, CORS, Web3 utils
- Frontend: React 18, Vite, Tailwind, Shadcn/ui, TypeScript
- Smart contracts: Hardhat, OpenZeppelin, Solidity (NFTMarketplace)

### 📦 Repository Layout
```
NFTHUB/
  backend/               # Django project and app (api served at /api)
  nftfrontend/           # React + Vite frontend
  smartcontract/         # Hardhat project (contracts, deploy scripts)
```

## ⚡ Quick Start

### 1) 🐍 Backend (Django API)
Requirements: Python 3.11+, pip

```
cd backend
python -m venv .venv
. .venv/Scripts/activate   # Windows PowerShell
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

API base URL: `http://localhost:8000/api`.

Optional: create a `.env` in `backend/backend/` (same folder as `settings.py`) with your own values:
```
WEB3_PROVIDER_URI=YOUR_RPC_URL
CONTRACT_ADDRESS=0xYourDeployedMarketplace
PINATA_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...   # Your Pinata JWT (Bearer token)
```

Useful management commands:
```
# Sync a single token from chain (reads metadata via web3 utils)
python manage.py sync_blockchain --token-id 1

# Sync all or create dummy NFTs for dev
python manage.py sync_blockchain --all
python manage.py sync_blockchain --all --create-dummy
```

### 2) 🖥️ Frontend (React + Vite)
Requirements: Node 18+ (or 20+)

```
cd nftfrontend
npm install
npm run dev
# Vite dev server prints URL (commonly http://localhost:5173)
```

The frontend expects the backend at `http://localhost:8000/api` (see `src/services/api.ts`).

### 3) 🔗 Smart Contracts (Hardhat)
Requirements: Node 18+, a Sepolia wallet private key, an RPC provider

```
cd smartcontract
npm install
cp sepolia_env_example.txt .env   # edit with your values

npx hardhat compile
npx hardhat test

# Deploy to Sepolia (example script)
npx hardhat run scripts/deploy.js --network sepolia
```

After deploying, update `backend/backend/settings.py` `CONTRACT_ADDRESS`, and redeploy/restart the backend.

### 📌 Pinata / IPFS Setup
To enable media uploads to IPFS you need a Pinata account and a JWT token.

1) Create an account at [Pinata](https://pinata.cloud) and generate a JWT (Settings → API Keys → New Key → Select “JWT”).
2) Copy the JWT and set it in the backend environment as `PINATA_JWT` (see `.env` example above).
3) Restart the Django server.

Verify upload works:
```bash
# Upload a local file to IPFS via the backend
curl -X POST \
  -H "Authorization: Bearer <your-pinata-jwt>" \
  -F file=@/path/to/your.png \
  http://localhost:8000/api/upload/ipfs/
# Response contains { success: true, ipfsHash: "..." }
```

Notes
- The backend uses `Authorization: Bearer <PINATA_JWT>` when calling Pinata; ensure the token is valid and has pin permissions.
- You can pass base64 data URLs as well; the backend will detect and forward them to Pinata.

## 🧪 Backend API Overview

Base: `http://localhost:8000/api`

- NFTs ✨
  - `GET /nfts/` – list with filters and pagination
  - `GET /nfts/<token_id>/` – details for a specific local NFT
  - `POST /nfts/<token_id>/transfer/` – update owner (supports simulated transfers)
  - `POST /nfts/<str:nft_id>/toggle-like/` – like/unlike by user address (local NFTs: `local_<id>`)
  - `GET /nfts/combined/` – returns local NFTs only; supports `?user_address=<addr>&sort=likes`
  - Management: `POST /nfts/<token_id>/burn/`, `POST /nfts/<token_id>/hide/`, `POST /nfts/<token_id>/unhide/`, `POST /nfts/<token_id>/set_listed/`

- Collections 🗂️
  - `GET /collections/` – list collections
  - `GET /collections/trending/` – trending by total_volume
  - `GET /collections/by-likes/` – ranked by total likes (aggregated from favorites)

- Users / Profiles 👤
  - `GET /profiles/<wallet>/` – profile (auto‑creates basic profile if missing)
  - `POST /profiles/<wallet>/update/` – update profile fields + profile/cover image upload (base64)
  - `GET /profiles/<wallet>/nfts/` – collected (owned or created)
  - `GET /profiles/<wallet>/created/` – created by user
  - `GET /profiles/<wallet>/liked/` – NFTs liked by user
  - Social: `POST /profiles/<wallet>/follow/`, `POST /profiles/<wallet>/unfollow/`, `GET /profiles/<wallet>/followers/`, `GET /profiles/<wallet>/following/`

- Activities 📈
  - `GET /activities/?type=buy&time_filter=24h` – paginated activity feed
  - `GET /activities/stats/` – counts for 24h/7d/30d

- Contract / IPFS ⛓️
  - `GET /contract/info/`
  - `POST /upload/ipfs/` – upload a file (multipart `file`)

Example – like a local NFT:
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"user_address":"0xabc..."}' \
  http://localhost:8000/api/nfts/local_1/toggle-like/
```

## 🗄️ Data Model (simplified)
- `UserProfile`: wallet_address, username, avatar_url, banner_url, social links, following/followers M2M
- `NFT`: token_id, name, description, image_url, token_uri, owner_address, creator_address, price, flags (listed/auction), visibility flags (burned/hidden)
- `Collection`: name, description, creator_address, media, floor_price, total_volume, total_items
- `Transaction`: buy/list/mint/transfer/delist + follow/unfollow/hide/unhide; tracks price, gas, timestamps
- `Favorite`: user_address + nft (unique), represents likes
- `NFTView`: per‑NFT view tracking with uniqueness by nft + viewer/ip

## 🧭 Frontend Notes
- API client at `src/services/api.ts`; combined NFTs via `src/services/nftService.ts`
- Tailwind + shadcn/ui components in `src/components/ui/`
- Rankings page aggregates collection cards from API and per‑NFT likes. Letter‑avatar fallback is used for collection thumbnails.

## ⚙️ Environment & Configuration
- CORS is open for local dev in `backend/backend/settings.py`
- Media uploads are stored under `backend/media/` and served from `/media/`
- Default DB is SQLite at `backend/db.sqlite3`

## 🧷 Scripts Cheat Sheet
Backend
```
python manage.py migrate
python manage.py runserver
python manage.py sync_blockchain --all --create-dummy
```

Frontend
```
npm run i
npm run dev
npm run build
npm run preview
```

Smart Contracts
```
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.js --network sepolia
```

## ✅ Testing
- Backend: `python manage.py test` (there are several `test_*.py` files under `backend/`)
- Smart contracts: `npx hardhat test`

## 🛠️ Troubleshooting
- If frontend can’t reach the backend, confirm the API base in `src/services/api.ts` and that Django is running on `http://localhost:8000`.
- If media URLs 404, ensure `MEDIA_URL`/`MEDIA_ROOT` are correctly served (Django dev server handles this) and the files exist under `backend/media/`.
- If likes don’t persist, ensure you’re using local NFT IDs with the `local_` prefix for toggle‑like.

## 📜 License
This repository is provided as‑is for educational and development purposes. Add your preferred license.


