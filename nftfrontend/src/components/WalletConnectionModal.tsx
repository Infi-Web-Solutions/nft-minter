
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Wallet, AlertCircle } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';

interface WalletConnectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const WalletConnectionModal: React.FC<WalletConnectionModalProps> = ({
  open,
  onOpenChange,
}) => {
  const { connectWallet, isLoading, error } = useWallet();

  const handleConnect = async () => {
    try {
      await connectWallet();
      // Close modal on successful connection
      onOpenChange(false);
    } catch (err) {
      // Error is handled in the context
      console.error('Connection failed:', err);
    }
  };

  const handleInstallMetaMask = () => {
    window.open('https://metamask.io/download/', '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Connect Wallet
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            <Button
              onClick={handleConnect}
              disabled={isLoading}
              className="w-full"
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Wallet className="mr-2 h-4 w-4" />
                  Connect MetaMask
                </>
              )}
            </Button>

            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Don't have MetaMask?
              </p>
              <Button
                variant="link"
                onClick={handleInstallMetaMask}
                className="text-sm"
              >
                Install MetaMask
              </Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground space-y-2">
            <p>By connecting your wallet, you agree to our Terms of Service and Privacy Policy.</p>
            <p>Supported wallets: MetaMask, WalletConnect, and other Web3 wallets.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WalletConnectionModal;
