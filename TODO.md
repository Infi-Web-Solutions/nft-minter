# TODO: Configure Node.js Project for Sepolia Network

## Information Gathered
- Backend (`nft-minter-backend-node/src/utils/web3Utils.js`): Currently configured for Sepolia testnet using Alchemy API. Ethereum mainnet code is commented out at the top.
- Frontend (`nftfrontend/src/services/web3Service.ts`): Uses contract address matching Sepolia configuration.
- Hardhat config (`smartcontract/hardhat.config.js`): Has testnet and mainnet networks defined.
- No other logic changes required - only network configuration updates.

## Plan
- [x] Verified existing Sepolia configuration in backend web3Utils.js (already active)
- [x] Verified existing contract address in frontend web3Service.ts (matches Sepolia)
- [x] Confirmed Ethereum mainnet code is commented out in backend
- [x] Added addSepoliaNetwork function to frontend WalletContext for adding Sepolia to MetaMask

## Dependent Files to Edit
- `nftfrontend/src/contexts/WalletContext.tsx`

## Followup Steps
- [x] Configuration verified for Sepolia network
- [x] Ethereum code preserved as comments
- [x] Added Sepolia network addition functionality
- [ ] Test adding Sepolia network in MetaMask
- [ ] Verify contract interactions work on Sepolia if needed

---

# TODO: Implement Dynamic Notifications System

## Information Gathered
- Backend transaction model supports 'like' and 'unlike' transaction types.
- Backend controller for NFT likes now creates transaction records.
- New backend API endpoint `/activities/notifications/:walletAddress` aggregates notifications for a user.
- Frontend activity service and API service updated to fetch notifications.
- Frontend Notifications page updated to display dynamic notifications with icons.
- Navbar updated with notification count badge on Bell icon.

## Plan
- [x] Updated transaction model to include 'like' and 'unlike' types.
- [x] Modified NFT like controller to create transaction records for likes/unlikes.
- [x] Added getNotifications controller in activityController.js.
- [x] Added notifications route in activityRoutes.js.
- [x] Updated frontend activityService to include getNotifications method.
- [x] Updated frontend apiService to include notifications endpoint.
- [x] Updated Notifications.tsx to fetch and display dynamic notifications.
- [x] Added notification count badge to navbar Bell icon.

## Dependent Files to Edit
- Backend: `src/models/transaction.js`, `src/controllers/nftController.js`, `src/controllers/activityController.js`, `src/routes/activityRoutes.js`
- Frontend: `src/services/activityService.ts`, `src/services/api.ts`, `src/pages/Notifications.tsx`, `src/components/Navbar.tsx`

## Followup Steps
- [x] Backend API endpoint implemented and tested.
- [x] Frontend notifications page updated and tested.
- [x] Notification count badge added to navbar.
- [ ] Test notifications with real user interactions (likes, buys, follows).
- [ ] Test notification count updates in real-time.
- [ ] Implement marking notifications as read functionality if needed.
