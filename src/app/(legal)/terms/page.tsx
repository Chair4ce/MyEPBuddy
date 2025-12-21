import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms of Service for My EPBuddy - Understand the terms and conditions for using our EPB statement generator.",
};

export default function TermsOfServicePage() {
  return (
    <article className="prose prose-neutral dark:prose-invert max-w-none">
      <h1>Terms of Service</h1>
      <p className="text-muted-foreground">
        Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </p>

      <section className="mt-8">
        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using My EPBuddy (&quot;the Service&quot;), you agree to be bound by these 
          Terms of Service. If you do not agree to these terms, please do not use the Service.
        </p>
      </section>

      <section className="mt-8">
        <h2>2. Important Disclaimers</h2>
        
        <div className="bg-muted/50 border rounded-lg p-4 my-4">
          <p className="font-semibold text-foreground mb-2">Government Affiliation Disclaimer</p>
          <p className="text-sm mb-0">
            My EPBuddy is an <strong>independent, privately-operated personal productivity tool</strong>. 
            It is <strong>NOT</strong> affiliated with, endorsed by, sponsored by, or connected to:
          </p>
          <ul className="text-sm mt-2 mb-0">
            <li>The United States Air Force</li>
            <li>The Department of Defense</li>
            <li>The United States Government</li>
            <li>Any military or government agency</li>
          </ul>
        </div>

        <div className="bg-muted/50 border rounded-lg p-4 my-4">
          <p className="font-semibold text-foreground mb-2">Content Disclaimer</p>
          <p className="text-sm mb-0">
            The AI-generated statements provided by this Service are <strong>drafts and suggestions only</strong>. 
            Users are solely responsible for:
          </p>
          <ul className="text-sm mt-2 mb-0">
            <li>Reviewing and editing all generated content before use</li>
            <li>Ensuring accuracy and truthfulness of all statements</li>
            <li>Compliance with current AFI 36-2406 and any other applicable regulations</li>
            <li>Final content submitted in official evaluations</li>
          </ul>
        </div>
      </section>

      <section className="mt-8">
        <h2>3. Description of Service</h2>
        <p>
          My EPBuddy is a personal productivity tool that helps Air Force service members:
        </p>
        <ul>
          <li>Track accomplishments throughout the evaluation period</li>
          <li>Generate draft narrative statements using AI assistance</li>
          <li>Organize and manage performance documentation</li>
          <li>Collaborate with supervisors and team members</li>
        </ul>
        <p>
          The Service is designed as an <strong>assistive tool</strong> and does not replace 
          official Air Force systems, processes, or guidance.
        </p>
      </section>

      <section className="mt-8">
        <h2>4. User Responsibilities</h2>
        <p>By using the Service, you agree to:</p>
        <ul>
          <li>Provide accurate information when creating your account</li>
          <li>Keep your login credentials secure and confidential</li>
          <li>Not share accounts with other individuals</li>
          <li>Not use the Service for any unlawful purpose</li>
          <li>Not attempt to circumvent any security measures</li>
          <li>Review and verify all AI-generated content before official use</li>
          <li>Comply with all applicable laws and regulations</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2>5. API Keys and Third-Party Services</h2>
        <p>
          The Service allows you to use your own API keys for AI providers (OpenAI, Anthropic, Google). 
          When using these integrations:
        </p>
        <ul>
          <li>You are responsible for complying with the terms of service of those providers</li>
          <li>You are responsible for any costs associated with your API usage</li>
          <li>Your data may be processed by these third-party services according to their policies</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2>6. Intellectual Property</h2>
        <p>
          <strong>Your Content:</strong> You retain all rights to the accomplishment data and 
          content you input into the Service. Generated statements based on your input are 
          considered your content.
        </p>
        <p>
          <strong>Our Content:</strong> The Service, including its design, code, and features, 
          is protected by intellectual property laws. You may not copy, modify, or distribute 
          the Service without permission.
        </p>
      </section>

      <section className="mt-8">
        <h2>7. Limitation of Liability</h2>
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, 
          EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT:
        </p>
        <ul>
          <li>The Service will be uninterrupted or error-free</li>
          <li>AI-generated content will be accurate or suitable for any purpose</li>
          <li>The Service will meet your specific requirements</li>
        </ul>
        <p>
          IN NO EVENT SHALL WE BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, 
          OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE.
        </p>
      </section>

      <section className="mt-8">
        <h2>8. Indemnification</h2>
        <p>
          You agree to indemnify and hold harmless My EPBuddy and its operators from any claims, 
          damages, or expenses arising from your use of the Service, including any claims related 
          to content you submit or generate using the Service.
        </p>
      </section>

      <section className="mt-8">
        <h2>9. Account Termination</h2>
        <p>
          We reserve the right to suspend or terminate accounts that violate these Terms of Service. 
          You may also delete your account at any time through the Service settings or by contacting us.
        </p>
      </section>

      <section className="mt-8">
        <h2>10. Changes to Terms</h2>
        <p>
          We may update these Terms of Service from time to time. Continued use of the Service 
          after changes are posted constitutes acceptance of the updated terms. We will notify 
          users of significant changes via email or through the Service.
        </p>
      </section>

      <section className="mt-8">
        <h2>11. Governing Law</h2>
        <p>
          These Terms of Service shall be governed by and construed in accordance with the laws 
          of the United States, without regard to conflict of law principles.
        </p>
      </section>

      <section className="mt-8">
        <h2>12. Contact</h2>
        <p>
          If you have questions about these Terms of Service, please contact us through the 
          Support page within the application.
        </p>
      </section>
    </article>
  );
}

