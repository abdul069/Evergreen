import axios from 'axios';

const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN || '';
const RAILWAY_SERVICE_ID = process.env.RAILWAY_SERVICE_ID || '';
const RAILWAY_PROJECT_ID = process.env.RAILWAY_PROJECT_ID || '';
const RAILWAY_ENVIRONMENT_ID = process.env.RAILWAY_ENVIRONMENT_ID || '';
const NETLIFY_TOKEN = process.env.NETLIFY_TOKEN || '';
const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID || '';

export async function restartSelf(): Promise<string> {
  try {
    const mutation = `
      mutation {
        serviceInstanceRedeploy(
          serviceId: "${RAILWAY_SERVICE_ID}",
          environmentId: "${RAILWAY_ENVIRONMENT_ID}"
        )
      }
    `;

    await axios.post(
      'https://backboard.railway.com/graphql/v2',
      { query: mutation },
      {
        headers: {
          'Authorization': `Bearer ${RAILWAY_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return 'Railway restart triggered successfully';
  } catch (error: any) {
    return `Railway restart failed: ${error.message}`;
  }
}

export async function deployNetlify(): Promise<string> {
  try {
    const response = await axios.post(
      `https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/deploys`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${NETLIFY_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return `Netlify deploy triggered: ${response.data.id}`;
  } catch (error: any) {
    return `Netlify deploy failed: ${error.message}`;
  }
}

export async function setRailwayVariable(key: string, value: string): Promise<string> {
  try {
    const mutation = `
      mutation {
        variableUpsert(input: {
          projectId: "${RAILWAY_PROJECT_ID}",
          environmentId: "${RAILWAY_ENVIRONMENT_ID}",
          serviceId: "${RAILWAY_SERVICE_ID}",
          name: "${key}",
          value: "${value}"
        })
      }
    `;

    await axios.post(
      'https://backboard.railway.com/graphql/v2',
      { query: mutation },
      {
        headers: {
          'Authorization': `Bearer ${RAILWAY_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return `Variable ${key} set successfully`;
  } catch (error: any) {
    return `Variable set failed: ${error.message}`;
  }
}
