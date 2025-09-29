
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ThemeProvider from "@/components/ThemeProvider";
import { WalletProvider } from "@/contexts/WalletContext";
import Index from "./pages/Index";
import Marketplace from "./pages/Marketplace";

import Profile from "./pages/Profile";
import UserProfile from "./pages/UserProfile";
import Create from "./pages/Create";
import Collections from "./pages/Collections";
import Rankings from "./pages/Rankings";
import Activity from "./pages/Activity";
import Stats from "./pages/Stats";
import Notifications from "./pages/Notifications";
import Cart from "./pages/Cart";
import NotFound from "./pages/NotFound";
import NFTDetails from "./pages/NFTDetails";
import CollectionDetails from "./pages/CollectionDetails";
import Favorites from "./pages/Favorites";
import Contact from "./pages/Contact";
import { LikeProvider } from '@/contexts/LikeContext';
import { FollowProvider } from '@/contexts/FollowContext';

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <WalletProvider>
        <LikeProvider>
          <FollowProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/marketplace" element={<Marketplace />} />
        
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/profile/:walletAddress" element={<UserProfile />} />
                  <Route path="/create" element={<Create />} />
                  <Route path="/collections" element={<Collections />} />
                  <Route path="/collection/:slug" element={<CollectionDetails />} />
                  <Route path="/rankings" element={<Rankings />} />
                  <Route path="/activity" element={<Activity />} />
                  <Route path="/stats" element={<Stats />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/cart" element={<Cart />} />
                  <Route path="/nft/:id" element={<NFTDetails />} />
                  <Route path="/favorites" element={<Favorites />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </FollowProvider>
        </LikeProvider>
      </WalletProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
