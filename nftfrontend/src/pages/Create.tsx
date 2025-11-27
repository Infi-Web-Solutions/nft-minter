
import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Upload, Image, Video, Music, Loader2 } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { useWallet } from '@/contexts/WalletContext';
import { toast } from 'sonner';
import { ethers } from 'ethers';
import WalletGuard from '@/components/WalletGuard';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { apiUrl } from '@/config';

// Import ABI and contract address
import NFTMarketplaceABI from '../../../smartcontract/artifacts/contracts/nftmarketplace.sol/NFTMarketplace.json';
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

// Debug logging
console.log('[NFT] Contract Address:', CONTRACT_ADDRESS);
console.log('[NFT] Contract ABI available:', !!NFTMarketplaceABI?.abi);
if (!CONTRACT_ADDRESS) {
  console.error('[NFT] Error: Contract address is not set. Please check your .env file');
}

const Create = () => {
  const { address, signer } = useWallet();
  const [isUploading, setIsUploading] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    collection: '',
    category: 'art',
    royaltyEnabled: true,
    royaltyPercentage: '2.5',
    putOnSale: false,
    saleType: 'fixed',
    price: '',
    file: null as File | null,
    fileType: 'image' as 'image' | 'video' | 'audio',
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setFormData(prev => ({ ...prev, file }));
      setPreviewUrl(URL.createObjectURL(file));
      if (file.type.startsWith('video')) setFormData(prev => ({ ...prev, fileType: 'video' }));
      else if (file.type.startsWith('audio')) setFormData(prev => ({ ...prev, fileType: 'audio' }));
      else setFormData(prev => ({ ...prev, fileType: 'image' }));
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif'],
      'video/*': ['.mp4'],
      'audio/*': ['.mp3']
    },
    maxSize: 100 * 1024 * 1024, // 100MB
    multiple: false
  });

  const uploadToIPFS = async (file: File) => {
    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      
      // Replace with your IPFS upload endpoint
      const response = await fetch(apiUrl('/upload/ipfs/'), {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      
      return data.ipfsHash;
    } catch (error) {
      console.error('Error uploading to IPFS:', error);
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  const createMetadata = async (ipfsHash: string) => {
    const metadata: any = {
      name: formData.name,
      description: formData.description,
      attributes: [
        { trait_type: 'Category', value: formData.category },
        { trait_type: 'Collection', value: formData.collection || 'Default Collection' },
        { trait_type: 'Media Type', value: formData.fileType },
      ]
    };
    if (formData.fileType === 'image') {
      metadata.image = `ipfs://${ipfsHash}`;
    } else {
      metadata.animation_url = `ipfs://${ipfsHash}`;
    }

    // Upload metadata to IPFS
    const blob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
    const metadataFile = new File([blob], 'metadata.json');
    return await uploadToIPFS(metadataFile);
  };

  const handleCreateNFT = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.file || !address || !signer) return;

    let tokenId; // <-- Declare tokenId in function scope

    try {
      setIsMinting(true);
      toast.loading('Preparing your NFT...', { id: 'minting' });

      // 1. Upload image to IPFS
      const imageHash = await uploadToIPFS(formData.file);
      toast.loading('Uploading metadata...', { id: 'minting' });
      
      // 2. Create and upload metadata
      const metadataHash = await createMetadata(imageHash);
      
      // 3. Mint NFT
      if (!CONTRACT_ADDRESS) {
        throw new Error('Contract address is not configured. Please check your environment variables.');
      }

      if (!NFTMarketplaceABI?.abi) {
        throw new Error('Contract ABI is not available. Please check the import path.');
      }

      console.log('[NFT] Initializing contract with address:', CONTRACT_ADDRESS);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, NFTMarketplaceABI.abi, signer);
      
      if (!contract) {
        throw new Error('Failed to initialize contract');
      }

      // Log contract details safely
      console.log('[NFT] Contract instance:', contract);
      
      // Safely check and log available functions
      if (contract.functions) {
        const functions = Object.keys(contract.functions);
        console.log('[NFT] Available contract functions:', functions.join(', '));
      } else {
        console.log('[NFT] Contract functions not immediately available');
      }

      // Log interface functions from ABI
      console.log('[NFT] Contract ABI functions:', 
        NFTMarketplaceABI.abi
          .filter((item: any) => item.type === 'function')
          .map((item: any) => item.name)
          .join(', ')
      );
      
      toast.loading('Please confirm the transaction...', { id: 'minting' });
      const tx = await contract.mintNFT(
        formData.name,
        formData.description,
        `ipfs://${metadataHash}`,
        formData.category,
        Math.floor(parseFloat(formData.royaltyPercentage) * 100), // Convert to basis points (2.5% -> 250)
        formData.collection || 'Default Collection'
      );

      toast.loading('Minting your NFT...', { id: 'minting' });
      // Wait for mint transaction to complete and get the receipt
      const receipt = await tx.wait();
      console.log('[NFT] Mint transaction receipt:', receipt);
      console.log('[NFT] All receipt events:', receipt.events);
      if (receipt.events) {
        for (const event of receipt.events) {
          console.log('[NFT] Event:', event);
        }
      }

      // Robustly extract tokenId from events or logs
      let tokenId;
      // Try events first
      if (receipt.events) {
        for (const event of receipt.events) {
          if (event.args && (event.args.tokenId || event.args.token_id || event.args._tokenId)) {
            tokenId = event.args.tokenId || event.args.token_id || event.args._tokenId;
            break;
          }
        }
      }
      console.log('[NFT] All receipt logs:', receipt.logs);
      // Fallback: Try logs if events are undefined
      if (!tokenId && receipt.logs) {
        const transferTopic = ethers.id("Transfer(address,address,uint256)");
        for (const log of receipt.logs) {
          if (log.topics && log.topics[0] === transferTopic) {
            tokenId = ethers.getBigInt(log.topics[3]);
            console.log('[NFT] Extracted tokenId from logs:', tokenId);
            break;
          }
        }
      }
      console.log('[NFT] Final extracted tokenId:', tokenId);

      // 4. If put on sale, list the NFT
      if (formData.putOnSale && formData.price && tokenId) {
        const price = ethers.parseEther(formData.price);
        const isAuction = formData.saleType === 'auction';
        toast.loading('Listing your NFT...', { id: 'minting' });
        const listingTx = await contract.listNFT(
          tokenId,
          price,
          isAuction,
          isAuction ? 7 * 24 * 60 * 60 : 0 // 7 days for auction
        );
        await listingTx.wait();
      }

      // Register NFT in backend
      try {
        let finalTokenId = undefined;
        if (typeof tokenId !== 'undefined') {
          finalTokenId = tokenId.toString();
        }
        if (!finalTokenId) {
          throw new Error('Could not determine token ID for backend registration');
        }
        const mediaTag = formData.fileType === 'image' ? '' : `?mt=${formData.fileType}`;
        const registerData = {
          token_id: finalTokenId,
          name: formData.name,
          description: formData.description,
          image_url: `ipfs://${imageHash}${mediaTag}`,
          token_uri: `ipfs://${metadataHash}`,
          creator_address: address,
          owner_address: address,
          price: formData.price || null,
          is_listed: !!formData.putOnSale,
          is_auction: formData.saleType === 'auction',
          collection: formData.collection || 'Default Collection',
          category: formData.category,
        };
        await fetch(apiUrl('/nfts/register/'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(registerData),
        });
      } catch (err) {
        console.error('Failed to register NFT in backend:', err);
      }

      toast.success('NFT created successfully!', { id: 'minting' });

      // Reset form
      setFormData({
        name: '',
        description: '',
        collection: '',
        category: 'art',
        royaltyEnabled: true,
        royaltyPercentage: '2.5',
        putOnSale: false,
        saleType: 'fixed',
        price: '',
        file: null,
        fileType: 'image'
      });
      setPreviewUrl(null);

    } catch (error: any) {
      console.error('Error creating NFT:', error);
      toast.error(error.message || 'Failed to create NFT', { id: 'minting' });
    } finally {
      setIsMinting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <WalletGuard message="Connect your wallet to create NFTs">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-4">Create New NFT</h1>
              <p className="text-muted-foreground">Upload your digital artwork and mint it as an NFT</p>
            </div>

            <form onSubmit={handleCreateNFT}>
              <div className="grid gap-8 lg:grid-cols-2">
                {/* Upload Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>Upload File</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div
                      {...getRootProps()}
                      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                        ${isDragActive ? 'border-primary' : 'border-muted-foreground/25'}
                        hover:border-muted-foreground/50`}
                    >
                      <input {...getInputProps()} />
                      {previewUrl ? (
                        <div className="space-y-4">
                          <img
                            src={previewUrl}
                            alt="Preview"
                            className="max-h-64 mx-auto rounded-lg"
                          />
                          <p className="text-sm text-muted-foreground">
                            Click or drag to replace
                          </p>
                        </div>
                      ) : (
                        <div>
                          <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                          <p className="text-sm font-medium mb-2">
                            {isDragActive ? 'Drop here' : 'Drag & drop your file here, or browse'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            PNG, JPG, GIF, WebP, MP4, MP3 up to 100MB
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <Button 
                        type="button"
                        variant="outline" 
                        className="flex items-center gap-2"
                        onClick={() => setFormData(prev => ({ ...prev, fileType: 'image' }))}
                      >
                        <Image className="h-4 w-4" />
                        Image
                      </Button>
                      <Button 
                        type="button"
                        variant="outline" 
                        className="flex items-center gap-2"
                        onClick={() => setFormData(prev => ({ ...prev, fileType: 'video' }))}
                      >
                        <Video className="h-4 w-4" />
                        Video
                      </Button>
                      <Button 
                        type="button"
                        variant="outline" 
                        className="flex items-center gap-2"
                        onClick={() => setFormData(prev => ({ ...prev, fileType: 'audio' }))}
                      >
                        <Music className="h-4 w-4" />
                        Audio
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Preview */}
                <Card>
                  <CardHeader>
                    <CardTitle>Preview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="aspect-square bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                      {previewUrl ? (
                        formData.fileType === 'image' ? (
                          <img
                            src={previewUrl}
                            alt="NFT Preview"
                            className="w-full h-full object-contain"
                          />
                        ) : formData.fileType === 'video' ? (
                          <video src={previewUrl} controls className="w-full h-full object-contain" />
                        ) : (
                          <audio src={previewUrl} controls className="w-full" />
                        )
                      ) : (
                        <p className="text-muted-foreground">Upload a file to see preview</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* NFT Details */}
              <Card className="mt-8">
                <CardHeader>
                  <CardTitle>NFT Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name*</Label>
                    <Input 
                      id="name" 
                      value={formData.name}
                      onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter NFT name"
                      required 
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea 
                      id="description" 
                      value={formData.description}
                      onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Provide a detailed description of your NFT"
                      rows={4}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="collection">Collection</Label>
                      <Input
                        id="collection"
                        value={formData.collection}
                        onChange={e => setFormData(prev => ({ ...prev, collection: e.target.value }))}
                        placeholder="Enter collection name"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="category">Category</Label>
                      <Select
                        value={formData.category}
                        onValueChange={value => setFormData(prev => ({ ...prev, category: value }))}
                      >
                        <SelectTrigger id="category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="art">Art</SelectItem>
                          <SelectItem value="gaming">Gaming</SelectItem>
                          <SelectItem value="music">Music</SelectItem>
                          <SelectItem value="photography">Photography</SelectItem>
                          <SelectItem value="sports">Sports</SelectItem>
                          <SelectItem value="collectibles">Collectibles</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="font-semibold mb-4">Royalties</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="royalties">Creator Royalties</Label>
                        <Switch 
                          id="royalties" 
                          checked={formData.royaltyEnabled}
                          onCheckedChange={checked => setFormData(prev => ({ ...prev, royaltyEnabled: checked }))}
                        />
                      </div>
                      {formData.royaltyEnabled && (
                        <div className="space-y-2">
                          <Label htmlFor="royalty-percentage">Royalty Percentage (%)</Label>
                          <Input 
                            id="royalty-percentage" 
                            type="number"
                            value={formData.royaltyPercentage}
                            onChange={e => setFormData(prev => ({ ...prev, royaltyPercentage: e.target.value }))}
                            min="0"
                            max="10"
                            step="0.1"
                            placeholder="5"
                          />
                          <p className="text-sm text-muted-foreground">Max 10%</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="font-semibold mb-4">Sale Options</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="put-on-sale">Put on marketplace</Label>
                        <Switch 
                          id="put-on-sale"
                          checked={formData.putOnSale}
                          onCheckedChange={checked => setFormData(prev => ({ ...prev, putOnSale: checked }))}
                        />
                      </div>
                      {formData.putOnSale && (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="price">Price (ETH)</Label>
                            <Input 
                              id="price"
                              type="number"
                              value={formData.price}
                              onChange={e => setFormData(prev => ({ ...prev, price: e.target.value }))}
                              min="0"
                              step="0.001"
                              placeholder="0.5"
                              required={formData.putOnSale}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="sale-type">Sale Type</Label>
                            <Select
                              value={formData.saleType}
                              onValueChange={value => setFormData(prev => ({ ...prev, saleType: value }))}
                            >
                              <SelectTrigger id="sale-type">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="fixed">Fixed Price</SelectItem>
                                <SelectItem value="auction">Auction</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-6">
                    <Button 
                      type="submit"
                      size="lg"
                      className="w-full bg-gradient-to-r from-purple-500 to-blue-600"
                      disabled={!formData.file || isUploading || isMinting}
                    >
                      {isUploading || isMinting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          {isUploading ? 'Uploading...' : 'Creating NFT...'}
                        </>
                      ) : (
                        'Create NFT'
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </form>
          </div>
        </div>
      </WalletGuard>

      <Footer />
    </div>
  );
};

export default Create;
