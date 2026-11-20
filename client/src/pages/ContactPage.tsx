import { InfoLayout } from '../components/InfoLayout';

export function ContactPage() {
  return (
    <InfoLayout title="Contact us">
      <section className="content-page">
        <p className="eyebrow">Support</p>
        <h1>Contact us</h1>
        <div className="prose-block">
          <p>Need help with Between, your account, or privacy requests?</p>
          <p>
            Email us at{' '}
            <a className="accent-link" href="mailto:hello@knics.app">
              hello@knics.app
            </a>{' '}
            and we will get back to you as soon as we can.
          </p>
        </div>
      </section>
    </InfoLayout>
  );
}
