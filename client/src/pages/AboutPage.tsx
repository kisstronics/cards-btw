import { AppShell } from '../components/AppShell';

const inspirations = [
  'Narayan Blue Man',
  'Pawan Sir',
  'Venkatesh Sir',
  'Sai Sir',
];

export function AboutPage() {
  return (
    <AppShell title="Who we are">
      <section className="content-page about-page">
        <h1>Who we are</h1>
        <p>
          Between is a multiplayer card table for friends — quick hands, a
          shared board, and scores that can swing either way.
        </p>
        <p>
          This game is inspired by the people who made table nights memorable:
        </p>
        <ul className="inspire-list">
          {inspirations.map((name) => (
            <li key={name}>
              <span className="inspire-mark" aria-hidden="true" />
              {name}
            </li>
          ))}
        </ul>
        <p className="muted about-thanks">
          Built with respect for the tables they kept lively.
        </p>
      </section>
    </AppShell>
  );
}
