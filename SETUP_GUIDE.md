# NFT Marketplace Setup Guide

This guide will help you set up the complete NFT marketplace system with:
- **Smart Contract** (Solidity) - Deployed on Sepolia testnet
- **Django Backend** - REST API with Web3 integration
- **React Frontend** - Dynamic UI with real blockchain data

## 🎯 **System Overview**

### **Smart Contract**
- **Address**: `0xAB6FEdb0AdB537166425fd2bBd1F416b99899201`
- **Network**: Sepolia Testnet
- **Features**: Mint, list, buy, auction, royalties, collections

### **Django Backend**
- **API**: RESTful endpoints for NFTs, collections, users
- **Database**: SQLite (development) / PostgreSQL (production)
- **Web3**: Direct blockchain integration

### **React Frontend**
- **Framework**: React + TypeScript + Vite
- **UI**: Tailwind CSS + shadcn/ui
- **State**: Real-time data from Django API

## 🚀 **Quick Start**

### **1. Smart Contract (Already Deployed)**
```bash
cd smartcontract
# Contract is already deployed at: 0xAB6FEdb0AdB537166425fd2bBd1F416b99899201
```

### **2. Django Backend Setup**
```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Setup database
python manage.py makemigrations
python manage.py migrate

# Start server
python manage.py runserver
```

### **3. React Frontend Setup**
```bash
cd nftfrontend

# Install dependencies
npm install

# Start development server
npm run dev
```

## 📋 **Detailed Setup Instructions**

### **Backend Setup**

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Create database migrations:**
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

4. **Test the setup:**
   ```bash
   python test_django.py
   ```

5. **Start the Django server:**
   ```bash
   python manage.py runserver
   ```

6. **Test API endpoints:**
   - Visit: `http://localhost:8000/api/contract/info/`
   - Visit: `http://localhost:8000/api/nfts/`

### **Frontend Setup**

1. **Navigate to frontend directory:**
   ```bash
   cd nftfrontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Test the application:**
   - Visit: `http://localhost:5173`
   - The frontend will automatically connect to the Django backend

## 🔧 **API Endpoints**

### **NFTs**
- `GET /api/nfts/` - Get all NFTs with pagination
- `GET /api/nfts/<token_id>/` - Get specific NFT details
- `GET /api/nfts/search/?q=<query>` - Search NFTs

### **Collections**
- `GET /api/collections/` - Get all collections
- `GET /api/collections/trending/` - Get trending collections

### **Users**
- `GET /api/users/<wallet_address>/` - Get user profile
- `GET /api/users/<wallet_address>/nfts/` - Get user's NFTs

### **Contract**
- `GET /api/contract/info/` - Get contract information

## 🗄️ **Database Models**

### **NFT**
- Stores NFT metadata and marketplace data
- Links to blockchain token IDs
- Tracks ownership, pricing, and auction status

### **Collection**
- Manages NFT collections
- Tracks floor prices and trading volume

### **UserProfile**
- Extended user profiles with wallet addresses
- Social media links and statistics

### **Transaction**
- Records all blockchain transactions
- Tracks gas usage and pricing

## 🔗 **Frontend Integration**

The React frontend uses the API service to communicate with the Django backend:

```typescript
// Example: Fetch NFTs
import { apiService } from '@/services/api';

const fetchNFTs = async () => {
  try {
    const response = await apiService.getNFTs({
      page: 1,
      limit: 24,
      sort_by: 'created_at',
      sort_order: 'desc'
    });
    console.log('NFTs:', response.data);
  } catch (error) {
    console.error('Error:', error);
  }
};
```

## 🧪 **Testing**

### **Backend Testing**
```bash
cd backend
python test_django.py
```

### **API Testing**
```bash
# Test contract info
curl http://localhost:8000/api/contract/info/

# Test NFTs endpoint
curl http://localhost:8000/api/nfts/
```

### **Frontend Testing**
- Open browser to `http://localhost:5173`
- Navigate to Marketplace
- Check browser console for API calls

## 🔄 **Data Flow**

1. **User visits frontend** → React app loads
2. **Frontend calls Django API** → `GET /api/nfts/`
3. **Django queries database** → Returns NFT data
4. **Django calls blockchain** → Gets real-time data
5. **Frontend displays data** → Dynamic UI updates

## 🛠️ **Development Workflow**

### **Adding New Features**

1. **Backend (Django):**
   - Add models in `nft/models.py`
   - Create views in `nft/views.py`
   - Add URLs in `nft/urls.py`
   - Run migrations: `python manage.py makemigrations && python manage.py migrate`

2. **Frontend (React):**
   - Add API calls in `src/services/api.ts`
   - Create components in `src/components/`
   - Update pages in `src/pages/`

3. **Smart Contract:**
   - Modify `smartcontract/contracts/nftmarketplace.sol`
   - Compile: `npx hardhat compile`
   - Deploy: `npx hardhat run scripts/deploy.js --network testnet`

## 🚨 **Troubleshooting**

### **Backend Issues**
- **ModuleNotFoundError**: Run `pip install -r requirements.txt`
- **Database errors**: Run `python manage.py migrate`
- **Web3 connection**: Check Alchemy endpoint in settings

### **Frontend Issues**
- **API errors**: Ensure Django server is running on port 8000
- **CORS errors**: Check Django CORS settings
- **Build errors**: Run `npm install` and check TypeScript errors

### **Smart Contract Issues**
- **Compilation errors**: Check Solidity version compatibility
- **Deployment errors**: Verify private key and network settings
- **Transaction errors**: Ensure sufficient Sepolia ETH

## 📊 **Monitoring**

### **Backend Logs**
```bash
cd backend
python manage.py runserver --verbosity 2
```

### **Frontend Logs**
- Open browser DevTools
- Check Console and Network tabs

### **Blockchain Monitoring**
- Sepolia Etherscan: https://sepolia.etherscan.io/
- Contract: `0xAB6FEdb0AdB537166425fd2bBd1F416b99899201`

## 🎉 **Success Indicators**

✅ **Backend Running**: `http://localhost:8000/api/contract/info/` returns contract data
✅ **Frontend Running**: `http://localhost:5173` shows marketplace
✅ **API Connected**: Frontend loads real data from backend
✅ **Web3 Connected**: Backend can communicate with blockchain

## 📚 **Next Steps**

1. **Add more NFT data** using the sync command:
   ```bash
   python manage.py sync_blockchain --all
   ```

2. **Customize the UI** by modifying React components

3. **Add authentication** using Django REST framework

4. **Deploy to production** using proper hosting services

5. **Add more features** like favorites, notifications, etc.

---

**🎯 Your NFT marketplace is now fully functional with real blockchain integration!** 