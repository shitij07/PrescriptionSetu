import knex, { Knex } from 'knex';
import config from '../../knexfile';

let defaultInstance: Knex | null = null;

/**
 * Returns a configured Knex database instance.
 *
 * @param overrideConfig Optional custom configuration for testing/isolation.
 */
export function getDb(overrideConfig?: Knex.Config): Knex {
  if (overrideConfig) {
    return knex(overrideConfig);
  }

  if (!defaultInstance) {
    const environment = process.env.NODE_ENV || 'development';
    const envConfig = config[environment] || config['development'];
    defaultInstance = knex(envConfig);
  }

  return defaultInstance;
}

/**
 * Closes the default Knex database pool.
 */
export async function closeDb(): Promise<void> {
  if (defaultInstance) {
    await defaultInstance.destroy();
    defaultInstance = null;
  }
}
