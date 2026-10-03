import { Star } from 'lucide-react';
import { Button } from './shadcn/button';
import { favoritesStore, useFavorites } from '../state/favoritesStore';

export function FavoriteButton({ path, title, compact = false }: { path: string; title: string; compact?: boolean }) {
  const favorites = useFavorites();
  const selected = favorites.includes(path);
  const label = selected ? 'Remove ' + title + ' from favorites' : 'Add ' + title + ' to favorites';
  return (
    <Button
      type="button"
      variant={compact ? 'ghost' : 'outline'}
      size={compact ? 'icon-sm' : 'sm'}
      className={'favorite-button' + (compact ? ' favorite-button-compact' : '')}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      onClick={() => favoritesStore.toggle(path)}
    >
      <Star size={15} aria-hidden="true" fill={selected ? 'currentColor' : 'none'} />
      {!compact && <span>{selected ? 'Favorited' : 'Favorite'}</span>}
    </Button>
  );
}
