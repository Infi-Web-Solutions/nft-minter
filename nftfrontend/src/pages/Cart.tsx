
import React, { useState } from 'react';
import { ShoppingCart, Trash2, Plus, Minus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const Cart = () => {
  const { toast } = useToast();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [cartItems, setCartItems] = useState([
    {
      id: 1,
      title: 'Cool NFT #123',
      collection: 'Digital Dreams',
      price: 2.5,
      image: '/placeholder.svg',
      quantity: 1,
    },
    {
      id: 2,
      title: 'Pixel Art #456',
      collection: 'Retro Collection',
      price: 1.8,
      image: '/placeholder.svg',
      quantity: 1,
    },
  ]);

  const updateQuantity = (id: number, change: number) => {
    setCartItems(items =>
      items.map(item =>
        item.id === id
          ? { ...item, quantity: Math.max(1, item.quantity + change) }
          : item
      )
    );
  };

  const removeItem = (id: number) => {
    setCartItems(items => items.filter(item => item.id !== id));
  };

  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const fees = subtotal * 0.025; // 2.5% marketplace fee
  const total = subtotal + fees;

  const handleCheckout = async () => {
    setIsCheckingOut(true);
    
    // Simulate checkout process
    toast({
      title: "Processing checkout...",
      description: `Processing payment for ${total.toFixed(3)} ETH`,
    });
    
    // Simulate API call delay
    setTimeout(() => {
      setIsCheckingOut(false);
      toast({
        title: "Checkout initiated!",
        description: "Redirecting to payment gateway...",
      });
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center mb-8">
            <ShoppingCart className="h-8 w-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold mb-2">Shopping Cart</h1>
              <p className="text-muted-foreground">{cartItems.length} items in your cart</p>
            </div>
          </div>

          {cartItems.length === 0 ? (
            <div className="text-center py-16">
              <ShoppingCart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">Your cart is empty</h3>
              <p className="text-muted-foreground mb-6">Browse our marketplace to find amazing NFTs</p>
              <Button>Browse Marketplace</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Cart Items */}
              <div className="lg:col-span-2 space-y-4">
                {cartItems.map((item) => (
                  <Card key={item.id}>
                    <CardContent className="flex items-center space-x-4 p-6">
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-20 h-20 rounded-lg object-cover"
                      />
                      <div className="flex-1">
                        <h3 className="font-semibold">{item.title}</h3>
                        <p className="text-sm text-muted-foreground">{item.collection}</p>
                        <div className="flex items-center mt-2">
                          <Badge variant="secondary">{item.price} ETH</Badge>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuantity(item.id, -1)}
                          disabled={item.quantity <= 1}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-8 text-center">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuantity(item.id, 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(item.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Order Summary */}
              <div className="lg:col-span-1">
                <Card className="sticky top-8">
                  <CardHeader>
                    <CardTitle>Order Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>{subtotal.toFixed(3)} ETH</span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Marketplace fees (2.5%)</span>
                      <span>{fees.toFixed(3)} ETH</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-semibold text-lg">
                      <span>Total</span>
                      <span>{total.toFixed(3)} ETH</span>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      className="w-full" 
                      size="lg"
                      onClick={handleCheckout}
                      disabled={isCheckingOut}
                    >
                      {isCheckingOut ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        'Proceed to Checkout'
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Cart;
