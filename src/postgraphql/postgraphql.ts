import { Pool, PoolConfig } from 'pg'
import { parse as parsePgConnectionString } from 'pg-connection-string'
import createPostGraphQLSchema from './schema/createPostGraphQLSchema'
import createPostGraphQLHttpRequestHandler, { HttpRequestHandler } from './http/createPostGraphQLHttpRequestHandler'

/**
 * Creates a PostGraphQL Http request handler by first introspecting the
 * database to get a GraphQL schema, and then using that to create the Http
 * request handler.
 */
export default function postgraphql (
  poolOrConfig?: Pool | PoolConfig | string,
  schema: string | Array<string> = 'public',
  options: {
    classicIds?: boolean,
    dynamicJson?: boolean,
    graphqlRoute?: string,
    graphiqlRoute?: string,
    graphiql?: boolean,
    pgDefaultRole?: string,
    jwtSecret?: string,
    jwtPgTypeIdentifier?: string,
    showErrorStack?: boolean,
    disableQueryLog?: boolean,
    enableCors?: boolean,
  } = {},
): HttpRequestHandler {
  // Do some things with `poolOrConfig` so that in the end, we actually get a
  // Postgres pool.
  const pgPool =
    // If it is already a `Pool`, just use it.
    poolOrConfig instanceof Pool
      ? poolOrConfig
      : new Pool(typeof poolOrConfig === 'string'
        // Otherwise if it is a string, let us parse it to get a config to
        // create a `Pool`.
        ? parsePgConnectionString(poolOrConfig)
        // Finally, it must just be a config itself. If it is undefined, we
        // will just use an empty config and let the defaults take over.
        : poolOrConfig || {}
      )

  // Creates a promise which will resolve to a GraphQL schema. Connects a
  // client from our pool to introspect the database.
  const graphqlSchema = (async () => {
    const pgClient = await pgPool.connect()
    const subGraphqlSchema = await createPostGraphQLSchema(pgClient, schema, options)

    // If no release function exists, don’t release. This is just for tests.
    if (pgClient && pgClient.release)
      pgClient.release()

    return subGraphqlSchema
  })()

  // If we fail to build our schema, log the error and exit the process.
  graphqlSchema.catch(error => {
    // tslint:disable-next-line no-console
    console.error(`${error.stack}\n`)
    process.exit(1)
  })

  // Finally create our Http request handler using our options, the Postgres
  // pool, and GraphQL schema. Return the final result.
  return createPostGraphQLHttpRequestHandler(Object.assign({}, options, {
    graphqlSchema,
    pgPool,
  }))
}