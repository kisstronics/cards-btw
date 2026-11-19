import type { Card } from '../types';

const suitSymbol: Record<Card['suit'], string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export function CardView({
  card,
  faceDown = false,
  highlight = false,
}: {
  card?: Card | null;
  faceDown?: boolean;
  highlight?: boolean;
}) {
  if (faceDown || !card) {
    return <div className={`playing-card back ${highlight ? 'highlight' : ''}`} />;
  }

  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  return (
    <div
      className={`playing-card face ${red ? 'red' : 'black'} ${highlight ? 'highlight' : ''}`}
    >
      <span className="rank">{card.rank}</span>
      <span className="suit">{suitSymbol[card.suit]}</span>
    </div>
  );
}
