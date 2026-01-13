import { Helmet } from 'react-helmet-async';
import PropTypes from 'prop-types';

/**
 * SEO component for managing meta tags, OpenGraph, Twitter Cards, and structured data
 * Optimized for cycling training platform with focus on organic search and social sharing
 */
export default function SEO({
  title = 'tribos.studio - AI-Powered Cycling Training Platform',
  description = 'Elevate your cycling performance with tribos.studio. AI route planning, training analytics, and seamless device sync for Strava, Garmin, and Wahoo.',
  keywords = 'cycling training app, AI cycling routes, bike training planner, cycling analytics, strava sync, garmin connect, cycling performance',
  image = 'https://tribos.studio/og-image.svg',
  url = 'https://tribos.studio',
  type = 'website',
  structuredData = null,
  noindex = false,
}) {
  const siteName = 'tribos.studio';
  const twitterHandle = '@tribosstudio'; // Update with actual handle if available

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Canonical URL */}
      <link rel="canonical" href={url} />

      {/* OpenGraph / Facebook / LinkedIn */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:locale" content="en_US" />

      {/* Twitter / X */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={url} />
      <meta property="twitter:title" content={title} />
      <meta property="twitter:description" content={description} />
      <meta property="twitter:image" content={image} />
      {twitterHandle && <meta property="twitter:site" content={twitterHandle} />}

      {/* Instagram / Threads Meta Tags */}
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={title} />

      {/* Structured Data (JSON-LD) */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}
    </Helmet>
  );
}

SEO.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  keywords: PropTypes.string,
  image: PropTypes.string,
  url: PropTypes.string,
  type: PropTypes.string,
  structuredData: PropTypes.object,
  noindex: PropTypes.bool,
};

/**
 * Helper function to generate Organization structured data
 */
export function getOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'tribos.studio',
    applicationCategory: 'HealthApplication',
    applicationSubCategory: 'Fitness',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    description:
      'AI-powered cycling training platform with route planning, training analytics, and device synchronization for Strava, Garmin, and Wahoo.',
    featureList: [
      'AI Route Planning',
      'Training Analytics',
      'Strava Integration',
      'Garmin Connect Sync',
      'Wahoo Device Support',
      'Performance Tracking',
    ],
    screenshot: 'https://tribos.studio/og-image.svg',
    url: 'https://tribos.studio',
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '150',
    },
  };
}

/**
 * Helper function to generate WebSite structured data with search action
 */
export function getWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'tribos.studio',
    url: 'https://tribos.studio',
    description: 'AI-powered cycling training platform for route planning and performance analytics',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://tribos.studio/routes/list?q={search_term_string}',
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * Helper function to generate breadcrumb structured data
 */
export function getBreadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
