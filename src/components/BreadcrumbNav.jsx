import React from 'react';
import { Breadcrumbs, Anchor, Text } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/**
 * Breadcrumb Navigation Component
 * Provides hierarchical navigation trail showing user's current location
 */
const BreadcrumbNav = ({ items = [] }) => {
  const navigate = useNavigate();

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <Breadcrumbs
      separator={<ChevronRight size={14} color="var(--mantine-color-dimmed)" />}
      mb="md"
      style={{ fontSize: '14px' }}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        if (isLast) {
          return (
            <Text
              key={index}
              size="sm"
              fw={600}
              c="var(--mantine-color-text)"
              style={{ cursor: 'default' }}
            >
              {item.label}
            </Text>
          );
        }

        return (
          <Anchor
            key={index}
            size="sm"
            onClick={() => item.path && navigate(item.path)}
            style={{
              cursor: item.path ? 'pointer' : 'default',
              color: 'var(--mantine-color-dimmed)',
              textDecoration: 'none',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (item.path) {
                e.currentTarget.style.color = 'var(--mantine-color-text)';
              }
            }}
            onMouseLeave={(e) => {
              if (item.path) {
                e.currentTarget.style.color = 'var(--mantine-color-dimmed)';
              }
            }}
          >
            {item.label}
          </Anchor>
        );
      })}
    </Breadcrumbs>
  );
};

export default BreadcrumbNav;
