import React from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const Contact = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-24 text-center">
        <h1 className="text-3xl font-bold mb-4">Help Center</h1>
        <p className="text-muted-foreground mb-8">Coming soon</p>
      </div>
      <Footer />
    </div>
  );
};

export default Contact;


