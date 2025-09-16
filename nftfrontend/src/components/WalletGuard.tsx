
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, Lock } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import WalletConnectionModal from './WalletConnectionModal';

interface WalletGuardProps {
  children: React.ReactNode;
  message?: string;
}

const WalletGuard = ({ children, message = "Please connect your wallet to access this feature" }: WalletGuardProps) => {
  const { isConnected } = useWallet();
  const [showModal, setShowModal] = useState(false);

  if (!isConnected) {
    return (
      <>
        <Card className="max-w-md mx-auto mt-8">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center mb-4">
              <Lock className="h-6 w-6 text-white" />
            </div>
            <CardTitle>Wallet Required</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">{message}</p>
            <Button 
              onClick={() => setShowModal(true)}
              className="bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700"
            >
              <Wallet className="h-4 w-4 mr-2" />
              Connect Wallet
            </Button>
          </CardContent>
        </Card>
        <WalletConnectionModal open={showModal} onOpenChange={setShowModal} />
      </>
    );
  }

  return <>{children}</>;
};

export default WalletGuard;
