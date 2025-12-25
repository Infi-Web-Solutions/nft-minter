// Add this endpoint to nftController.js (before the proxyImage function at the end)

export const endAuction = async (req, res) => {
    try {
        const { token_id } = req.params;
        const { transaction_hash, winner, final_price } = req.body;

        console.log('[endAuction] Ending auction for token:', token_id);

        // Find the NFT
        const nft = await NFT.findOne({ token_id });
        if (!nft) {
            return res.status(404).json({ success: false, error: 'NFT not found' });
        }

        // Verify the transaction if hash is provided
        if (transaction_hash) {
            try {
                const receipt = await web3Utils.web3.eth.getTransactionReceipt(transaction_hash);
                if (!receipt || !receipt.status) {
                    return res.status(400).json({
                        success: false,
                        error: 'Transaction failed or not found'
                    });
                }
            } catch (error) {
                console.error('[endAuction] Transaction verification failed:', error);
            }
        }

        const oldOwner = nft.owner_address;

        // Update NFT ownership if there was a winner
        if (winner && winner !== ethers.constants.AddressZero) {
            nft.owner_address = winner;

            // Update user profile stats
            await UserProfile.findOneAndUpdate(
                { wallet_address: winner },
                { $inc: { total_collected: 1 } },
                { upsert: true }
            );

            if (oldOwner) {
                await UserProfile.findOneAndUpdate(
                    { wallet_address: oldOwner },
                    { $inc: { total_volume: final_price || 0 } },
                    { upsert: true }
                );
            }
        }

        // Mark auction as ended
        nft.is_listed = false;
        nft.is_auction = false;
        await nft.save();

        // Create transaction record
        if (transaction_hash && winner) {
            const transactionData = {
                transaction_hash,
                nft: nft._id,
                from_address: oldOwner,
                to_address: winner,
                transaction_type: 'auction_end',
                price: final_price || 0,
                timestamp: new Date(),
            };

            await Transaction.create(transactionData);
        }

        console.log('[endAuction] Auction ended successfully');
        return res.json({
            success: true,
            message: 'Auction ended successfully',
            new_owner: nft.owner_address
        });

    } catch (error) {
        console.error('[endAuction] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
