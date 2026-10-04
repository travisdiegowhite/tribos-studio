/**
 * Shop: owner-only inventory of spare parts, consumables and shop tools.
 * Plan: https://claude.ai/code/artifact/0edc9b2b-7ab4-45ea-9692-fcc0ae03e6cc
 *
 * tribos reaches in through this file (and owner.ts, which AppShell reads
 * without loading the feature); the shop reaches out only through host.ts.
 */
export { default as ShopRoutes } from './ShopRoutes';
