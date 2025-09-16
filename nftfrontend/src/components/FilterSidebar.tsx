
import React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

interface FilterSidebarProps {
  filters: {
    status: string[];
    priceRange: [number, number];
    collections: string[];
    blockchain: string[];
  };
  onFilterChange: (filterType: string, value: any) => void;
  onClearAll: () => void;
}

const FilterSidebar: React.FC<FilterSidebarProps> = ({ filters, onFilterChange, onClearAll }) => {
  const handleStatusChange = (status: string, checked: boolean) => {
    const newStatus = checked 
      ? [...filters.status, status]
      : filters.status.filter(s => s !== status);
    onFilterChange('status', newStatus);
  };

  const handleCollectionChange = (collection: string, checked: boolean) => {
    const newCollections = checked 
      ? [...filters.collections, collection]
      : filters.collections.filter(c => c !== collection);
    onFilterChange('collections', newCollections);
  };

  const handleBlockchainChange = (blockchain: string, checked: boolean) => {
    const newBlockchains = checked 
      ? [...filters.blockchain, blockchain]
      : filters.blockchain.filter(b => b !== blockchain);
    onFilterChange('blockchain', newBlockchains);
  };

  const handlePriceRangeChange = (value: number[]) => {
    onFilterChange('priceRange', [value[0], value[1]]);
  };

  const removeFilter = (filterType: string, value: string) => {
    if (filterType === 'status') {
      onFilterChange('status', filters.status.filter(s => s !== value));
    } else if (filterType === 'collections') {
      onFilterChange('collections', filters.collections.filter(c => c !== value));
    } else if (filterType === 'blockchain') {
      onFilterChange('blockchain', filters.blockchain.filter(b => b !== value));
    }
  };

  const activeFilters = [
    ...filters.status.map(s => ({ type: 'status', value: s })),
    ...filters.collections.map(c => ({ type: 'collections', value: c })),
    ...filters.blockchain.map(b => ({ type: 'blockchain', value: b })),
  ];

  return (
    <div className="w-80 space-y-6 p-6 bg-card border-r">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Filters</h3>
        <Button variant="ghost" size="sm" onClick={onClearAll}>
          Clear all
        </Button>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium">Status</h4>
        <div className="space-y-3">
          {['Buy Now', 'On Auction', 'New', 'Has Offers'].map((status) => (
            <div key={status} className="flex items-center space-x-2">
              <Checkbox 
                id={status}
                checked={filters.status.includes(status)}
                onCheckedChange={(checked) => handleStatusChange(status, checked as boolean)}
              />
              <label htmlFor={status} className="text-sm cursor-pointer">{status}</label>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h4 className="font-medium">Price Range</h4>
        <Slider 
          value={filters.priceRange}
          onValueChange={handlePriceRangeChange}
          max={100} 
          step={1} 
          className="w-full" 
        />
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{filters.priceRange[0]} ETH</span>
          <span>{filters.priceRange[1]} ETH</span>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h4 className="font-medium">Collections</h4>
        <div className="space-y-3">
          {['CryptoPunks', 'Bored Ape Yacht Club', 'Azuki', 'CloneX'].map((collection) => (
            <div key={collection} className="flex items-center space-x-2">
              <Checkbox 
                id={collection}
                checked={filters.collections.includes(collection)}
                onCheckedChange={(checked) => handleCollectionChange(collection, checked as boolean)}
              />
              <label htmlFor={collection} className="text-sm cursor-pointer">{collection}</label>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h4 className="font-medium">Blockchain</h4>
        <div className="space-y-3">
          {['Ethereum', 'Polygon', 'Solana'].map((chain) => (
            <div key={chain} className="flex items-center space-x-2">
              <Checkbox 
                id={chain}
                checked={filters.blockchain.includes(chain)}
                onCheckedChange={(checked) => handleBlockchainChange(chain, checked as boolean)}
              />
              <label htmlFor={chain} className="text-sm cursor-pointer">{chain}</label>
            </div>
          ))}
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div className="pt-4">
          <div className="flex flex-wrap gap-2">
            {activeFilters.map((filter, index) => (
              <Badge key={index} variant="secondary" className="flex items-center gap-1">
                {filter.value}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => removeFilter(filter.type, filter.value)}
                />
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FilterSidebar;
