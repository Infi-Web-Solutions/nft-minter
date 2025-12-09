import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ExternalLink, Copy, X } from 'lucide-react';
import { apiUrl } from '@/config';
import { toast } from 'sonner';

interface CollateralLeasingSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CollateralLeasingSidebar: React.FC<CollateralLeasingSidebarProps> = ({ open, onOpenChange }) => {
  const [nftAddress, setNftAddress] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [loading, setLoading] = useState(false);
  const [nftData, setNftData] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);

  const handleSearch = async () => {
    // Validate input - must have contract address + token ID
    const hasContractAndToken = contractAddress.trim() && tokenId.trim();

    if (!hasContractAndToken) {
      toast.error('Please enter both Contract Address and Token ID');
      return;
    }

    setLoading(true);
    setNotFound(false);
    setNftData(null);

    try {
      // Fetch external NFT data from blockchain
      const res = await fetch(apiUrl('/nfts/external/'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contract_address: contractAddress.trim(),
          token_id: tokenId.trim(),
        }),
      });
      
      const data = await res.json();

      if (data.success && data.data) {
        // NFT found
        setNftData(data.data);
        toast.success('External NFT found!');
      } else {
        setNotFound(true);
        toast.error(data.error || 'No NFT found for this address');
      }
    } catch (error) {
      console.error('Error fetching NFT:', error);
      toast.error('Failed to fetch NFT details from blockchain');
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const handleClose = () => {
    setNftAddress('');
    setContractAddress('');
    setTokenId('');
    setNftData(null);
    setNotFound(false);
    onOpenChange(false);
  };

  const getNFTImageUrl = (nft: any) => {
    if (!nft) return '';
    
    let imageUrl = nft.image_url || '';
    
    // Handle IPFS URLs
    if (imageUrl && imageUrl.startsWith('ipfs://')) {
      const ipfsHash = imageUrl.replace('ipfs://', '');
      imageUrl = `https://ipfs.io/ipfs/${ipfsHash}`;
    }
    
    return imageUrl;
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-50 transition-opacity"
        onClick={handleClose}
      />

      {/* Right Sidebar */}
      <div
        className={`fixed top-0 right-0 h-full w-full md:w-[500px] lg:w-[600px] bg-background shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border/40">
            <div>
              <h2 className="text-2xl font-bold gradient-text">Collateral Leasing</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Enter an NFT owner address to view and lease NFT details
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="shrink-0"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Search Methods */}
            <div className="space-y-4">

              {/* Method 2: Contract Address + Token ID */}
              <div className="space-y-3">
                <Label>Enter your  Contract Address + Token ID</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="contract-address" className="text-xs">Contract Address</Label>
                    <Input
                      id="contract-address"
                      placeholder="0x..."
                      value={contractAddress}
                      onChange={(e) => setContractAddress(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="token-id" className="text-xs">Token ID</Label>
                    <Input
                      id="token-id"
                      placeholder="123"
                      value={tokenId}
                      onChange={(e) => setTokenId(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    />
                  </div>
                </div>
              </div>

              {/* Search Button */}
              <Button onClick={handleSearch} disabled={loading} className="w-full">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Searching...
                  </>
                ) : (
                  'Search NFT'
                )}
              </Button>
            </div>

            {/* NFT Details Section */}
            {nftData && (
              <Card className="glass-card border-0">
                <CardContent className="p-6 space-y-4">
                  {/* NFT Image */}
                  <div className="relative aspect-square rounded-xl overflow-hidden mb-4">
                    <img
                      src={getNFTImageUrl(nftData)}
                      alt={nftData.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzc0MTUxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5GVCBJbWFnZTwvdGV4dD48L3N2Zz4=';
                      }}
                    />
                  </div>

                  {/* NFT Info */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-xl font-bold">{nftData.name}</h3>
                      {nftData.is_listed && (
                        <Badge variant="secondary" className="bg-green-500/20 text-green-500">
                          Listed
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {nftData.description || 'No description available'}
                    </p>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-card/50 rounded-lg p-3">
                      <div className="text-sm text-muted-foreground mb-1">Token ID</div>
                      <div className="font-semibold">{nftData.token_id}</div>
                    </div>
                    <div className="bg-card/50 rounded-lg p-3">
                      <div className="text-sm text-muted-foreground mb-1">Price</div>
                      <div className="font-semibold text-green-500">
                        {nftData.price ? (
                          <>
                            <div>Ξ{nftData.price}</div>
                            <div className="text-xs text-muted-foreground font-normal">
                              ${(parseFloat(nftData.price) * 1700).toFixed(2)}
                            </div>
                          </>
                        ) : (
                          'Not for sale'
                        )}
                      </div>
                    </div>
                    <div className="bg-card/50 rounded-lg p-3">
                      <div className="text-sm text-muted-foreground mb-1">Collection</div>
                      <div className="font-semibold">{nftData.collection || 'N/A'}</div>
                    </div>
                    <div className="bg-card/50 rounded-lg p-3">
                      <div className="text-sm text-muted-foreground mb-1">Category</div>
                      <div className="font-semibold">{nftData.category || 'N/A'}</div>
                    </div>
                  </div>

                  {/* Owner Address */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Owner Address</h4>
                    <div className="flex items-center gap-2 p-3 bg-card/50 rounded-lg">
                      <code className="text-sm text-muted-foreground flex-1 overflow-hidden text-ellipsis">
                        {nftData.owner_address}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(nftData.owner_address)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          window.open(`https://sepolia.etherscan.io/address/${nftData.owner_address}`, '_blank')
                        }
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Creator Address */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Creator Address</h4>
                    <div className="flex items-center gap-2 p-3 bg-card/50 rounded-lg">
                      <code className="text-sm text-muted-foreground flex-1 overflow-hidden text-ellipsis">
                        {nftData.creator_address}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(nftData.creator_address)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          window.open(`https://sepolia.etherscan.io/address/${nftData.creator_address}`, '_blank')
                        }
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Loan Details Section */}
                  {nftData.collateral_lending && (
                    <div className="mt-6 border-t border-border pt-6">
                      <h3 className="text-lg font-bold mb-4 gradient-text">💰 Collateral Loan Details</h3>
                      
                      {/* NFT Value */}
                      <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-lg p-4 mb-4">
                        <div className="text-sm text-muted-foreground mb-1">NFT Collateral Value</div>
                        <div className="text-2xl font-bold">
                          Ξ{nftData.collateral_lending.nft_value.eth}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          ${nftData.collateral_lending.nft_value.usd.toLocaleString()}
                        </div>
                      </div>

                      {/* Max Loan Amount */}
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-card/50 rounded-lg p-3">
                          <div className="text-xs text-muted-foreground mb-1">Max Loan (LTV {nftData.collateral_lending.ltv_percentage})</div>
                          <div className="text-lg font-bold text-green-500">
                            Ξ{nftData.collateral_lending.max_loan.eth}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ${nftData.collateral_lending.max_loan.usd.toLocaleString()}
                          </div>
                        </div>
                        <div className="bg-card/50 rounded-lg p-3">
                          <div className="text-xs text-muted-foreground mb-1">Interest Rate (APR)</div>
                          <div className="text-lg font-bold text-orange-500">
                            {nftData.collateral_lending.interest_rate.annual_percentage}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {(nftData.collateral_lending.interest_rate.monthly * 100).toFixed(2)}% monthly
                          </div>
                        </div>
                      </div>

                      {/* Loan Term Selector */}
                      <div className="mb-4">
                        <Label htmlFor="loan-term" className="text-sm font-semibold mb-2 block">Select Loan Term</Label>
                        <select
                          id="loan-term"
                          className="w-full p-3 bg-card/50 border border-border rounded-lg font-medium"
                          defaultValue="6_months"
                        >
                          <option value="3_months">
                            3 Months - Ξ{nftData.collateral_lending.loan_terms['3_months'].monthly_payment}/month
                          </option>
                          <option value="6_months">
                            6 Months - Ξ{nftData.collateral_lending.loan_terms['6_months'].monthly_payment}/month
                          </option>
                          <option value="12_months">
                            12 Months - Ξ{nftData.collateral_lending.loan_terms['12_months'].monthly_payment}/month
                          </option>
                        </select>
                      </div>

                      {/* Loan Terms Breakdown */}
                      <div className="space-y-3">
                        {/* 3 Months */}
                        <details className="bg-card/30 rounded-lg p-3">
                          <summary className="cursor-pointer font-semibold text-sm">📅 3 Months Plan</summary>
                          <div className="mt-3 space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Monthly Payment:</span>
                              <span className="font-semibold">Ξ{nftData.collateral_lending.loan_terms['3_months'].monthly_payment}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Total Interest:</span>
                              <span className="font-semibold text-orange-500">Ξ{nftData.collateral_lending.loan_terms['3_months'].total_interest}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Total Repayment:</span>
                              <span className="font-semibold">Ξ{nftData.collateral_lending.loan_terms['3_months'].total_repayment}</span>
                            </div>
                          </div>
                        </details>

                        {/* 6 Months */}
                        <details className="bg-card/30 rounded-lg p-3" open>
                          <summary className="cursor-pointer font-semibold text-sm">📅 6 Months Plan (Recommended)</summary>
                          <div className="mt-3 space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Monthly Payment:</span>
                              <span className="font-semibold">Ξ{nftData.collateral_lending.loan_terms['6_months'].monthly_payment}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Total Interest:</span>
                              <span className="font-semibold text-orange-500">Ξ{nftData.collateral_lending.loan_terms['6_months'].total_interest}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Total Repayment:</span>
                              <span className="font-semibold">Ξ{nftData.collateral_lending.loan_terms['6_months'].total_repayment}</span>
                            </div>
                          </div>
                        </details>

                        {/* 12 Months */}
                        <details className="bg-card/30 rounded-lg p-3">
                          <summary className="cursor-pointer font-semibold text-sm">📅 12 Months Plan</summary>
                          <div className="mt-3 space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Monthly Payment:</span>
                              <span className="font-semibold">Ξ{nftData.collateral_lending.loan_terms['12_months'].monthly_payment}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Total Interest:</span>
                              <span className="font-semibold text-orange-500">Ξ{nftData.collateral_lending.loan_terms['12_months'].total_interest}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Total Repayment:</span>
                              <span className="font-semibold">Ξ{nftData.collateral_lending.loan_terms['12_months'].total_repayment}</span>
                            </div>
                          </div>
                        </details>
                      </div>

                      {/* Liquidation Warning */}
                      <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                        <div className="text-xs font-semibold text-red-500 mb-1">⚠️ Liquidation Risk</div>
                        <div className="text-xs text-muted-foreground">
                          If NFT value drops below Ξ{nftData.collateral_lending.liquidation_threshold.value_eth} (${nftData.collateral_lending.liquidation_threshold.value_usd.toLocaleString()}), your NFT may be liquidated at {nftData.collateral_lending.liquidation_threshold.percentage} threshold.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-4">
                    <Button className="flex-1 bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700">
                      Start Leasing
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => window.open(`/nft/${nftData.id}`, '_blank')}
                    >
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Not Found Message */}
            {notFound && (
              <Card className="glass-card border-0">
                <CardContent className="p-6 text-center">
                  <p className="text-muted-foreground">No NFT found for this address. Please try a different address.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default CollateralLeasingSidebar;
