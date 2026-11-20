import { InfoLayout } from '../components/InfoLayout';

export function PrivacyPage() {
  return (
    <InfoLayout title="Privacy">
      <section className="content-page">
        <p className="eyebrow">Legal</p>
        <h1>Privacy</h1>
        <div className="prose-block">
          <p>
            We use your Google account only to sign you in and identify your
            player profile. Game rooms, scores, and session data stay associated
            with your account.
          </p>
          <p>
            We do not sell your personal data. You can sign out at any time. For
            privacy questions, use Contact us.
          </p>
        </div>
      </section>
    </InfoLayout>
  );
}
