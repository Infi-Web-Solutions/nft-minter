# Smart Contracts Review (Leasing & Marketplace Suite)

Scope reviewed:
- `FeeManager.sol`
- `WrappedLeasing.sol`
- `LeasingMarketplace.sol`
- `NFTCollateralLendingIntegrated.sol`
- `nftmarketplace.sol`

## Summary
- Core flows work and are aligned across contracts (fees via `FeeManager`, wrapping via `WrappedLeasing`, custodial leasing via `LeasingMarketplace`, lending integrates wrapped checks).
- Upgradeability: `FeeManager`, `WrappedLeasing`, `LeasingMarketplace` are UUPS; lending and marketplace are non-upgradeable.
- Main risks: no pausing/guardian, admin key centralization, custodial asset handling, deposit/wrap fee coupling, and limited checks around lifecycle edge cases.
- Recommendation: treat as “pre-production”; add controls below before mainnet.

## Per-Contract Notes

### FeeManager.sol
- UUPS, `FEE_ADMIN = DEFAULT_ADMIN_ROLE`; setters for marketplace/lending/leasing fees and treasury; pure `calcBps`.
- Risks: admin == default admin (single role); no pausability; no emit on upgrade (inherited).
- Production readiness: **Medium** — keep admin in multisig/gnosis, consider separating upgrade admin vs fee admin.

### WrappedLeasing.sol
- UUPS ERC721 wrapper with time-bound wNFT; collects lease fee `calcBps(durationSeconds, leasingFeeBps)` payable on `wrap`.
- Transfer guard: disallows transfer after expiry; unwrap allowed by original owner, expired, or admin.
- Risks: wrap fee is duration-based; treasury withdrawal handled off-chain; no pause; approvals remain after use.
- Production readiness: **Medium** — add pause; consider automatic burn on expiry; ensure feeManager.treasury withdrawal process is defined operationally.

### LeasingMarketplace.sol
- UUPS custodial leasing: listing transfers NFT to contract; rent pays rent + platform fee + wrap fee + deposit; mints wNFT to renter; deposit refundable to renter post-expiry; pull-payments for owner/treasury/renter.
- Fees: platformFee = leasingFeeBps on rent; wrapFee = leasingFeeBps on duration; both from FeeManager (coupled).
- Risks:
  - No pause/guardian.
  - Custodial NFT risk until rented/cancelled.
  - Deposit policy fixed at 50% of rent (may be misaligned with business logic).
  - Renter refund requires expiry and wNFT inactive; relies on renter/owner to unwrap; no auto-expire hook.
- Platform and wrap fee share same bps setting; cannot decouple (note: wrap fee now explicitly forwarded in rent flow).
- Production readiness: **Medium** — still add pause, configurable deposit policy, decouple platform vs wrap fee, and consider an expiry sweeper (admin/cron) to mark leases inactive and release deposits.

### NFTCollateralLendingIntegrated.sol
- Non-upgradeable, Ownable, ReentrancyGuard; supports ETH/ERC20 loans; pending withdrawals to avoid failed sends; liquidation blocks marketplace NFTs and checks wrapped leases.
- Risks:
  - No pause.
  - Owner powers broad; consider multisig.
  - No interest cap beyond 5 * BASIS_POINTS check for interestBps at create; principal/duration otherwise unchecked besides >0.
  - Whitelist optional; marketplace flag bypasses custody (assumes already escrowed).
  - Pending NFT queue on failed transfer but no withdraw function for pendingNFTs (cannot reclaim if push fails).
- Production readiness: **Medium/Low** — add pause; add withdraw function for pendingNFTs; consider upgrade path; enforce consistent LTV/interest validation; add events on admin setters.

### nftmarketplace.sol
- Non-upgradeable ERC721 marketplace with minting, listing, auctions, external NFT custody, royalties; fixed marketplace fee (250 bps), no FeeManager link.
- Risks:
  - No pause.
  - Uses transferFrom for external NFTs (assumes approval), not safeTransferFrom.
  - Owner fee withdraw drains full balance (includes any stray funds).
  - Royalties simple, not EIP-2981.
- Production readiness: **Medium/Low** — add pause; safeTransferFrom for external flows; segregate fee accounting; consider upgrade/migration strategy.

## Cross-Cutting Recommendations (Before Production)
- **Access control:** separate upgrade admin from ops admin; use multisig for both.
- **Pausability:** add `Pausable` to critical flows (rent, wrap, lend, buy, fund, repay, liquidate).
- **Custody safety:** add emergency withdrawal procedures for stuck NFTs/ETH/erc20; add a withdraw function for `pendingNFTs` in lending.
- **Fee configuration:** decouple leasing platform fee from wrap fee; make deposit policy configurable; ensure wrap fee forwarding remains tested.
- **Lifecycle automation:** add admin/keeper function to sweep expired leases and finalize refunds; consider auto-burn on expiry.
- **Testing:** expand tests for: partial withdrawals, expiry sweep, failed transfers, fee edge cases, reentrancy on withdraw flows.
- **Audit:** obtain an external security audit before mainnet.

## Readiness Verdict
Treat the suite as **not production-ready yet**. Medium confidence for controlled/testnet deployments; for mainnet, implement the above controls (pause, role separation, fee/deposit configurability, emergency paths) and obtain an external audit.***

