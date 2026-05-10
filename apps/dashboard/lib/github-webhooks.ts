// Service for managing GitHub webhooks

export interface WebhookConfig {
  url: string
  events: string[]
  active: boolean
  config: {
    url: string
    content_type: "json" | "form"
    secret?: string
    insecure_ssl?: "0" | "1"
  }
}

export interface WebhookResponse {
  id: number
  url: string
  test_url: string
  ping_url: string
  deliveries_url: string
  name: string
  events: string[]
  active: boolean
  config: {
    content_type: string
    insecure_ssl: string
    url: string
  }
  updated_at: string
  created_at: string
}

class GitHubWebhookService {
  private baseUrl = "/api/dashboard/github"

  // Get existing webhooks for a repository
  async getRepositoryWebhooks(repoFullName: string): Promise<WebhookResponse[]> {
    const response = await fetch(`${this.baseUrl}/webhooks/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repository: repoFullName })
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch webhooks: ${response.statusText}`)
    }

    return response.json()
  }

  // Create a new webhook for a repository
  async createWebhook(repoFullName: string, config: Partial<WebhookConfig>): Promise<WebhookResponse> {
    // Use environment variable or fallback to localhost for development
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"
    const webhookUrl = `${baseUrl}/api/webhooks/github`
    
    const webhookConfig: WebhookConfig = {
      url: webhookUrl,
      events: [
        "member",
        "membership", 
        "collaborator",
        "push",
        "repository",
        "pull_request"
      ],
      active: true,
      config: {
        url: webhookUrl,
        content_type: "json",
        secret: process.env.GITHUB_WEBHOOK_SECRET,
        insecure_ssl: "0"
      },
      ...config
    }

    const response = await fetch(`${this.baseUrl}/webhooks/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repository: repoFullName,
        webhook: webhookConfig
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to create webhook: ${error}`)
    }

    return response.json()
  }

  // Delete a webhook
  async deleteWebhook(repoFullName: string, webhookId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/webhooks/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repository: repoFullName,
        webhook_id: webhookId
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to delete webhook: ${response.statusText}`)
    }
  }

  // Update webhook configuration
  async updateWebhook(
    repoFullName: string, 
    webhookId: number, 
    config: Partial<WebhookConfig>
  ): Promise<WebhookResponse> {
    const response = await fetch(`${this.baseUrl}/webhooks/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repository: repoFullName,
        webhook_id: webhookId,
        webhook: config
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to update webhook: ${response.statusText}`)
    }

    return response.json()
  }

  // Test webhook delivery
  async testWebhook(repoFullName: string, webhookId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/webhooks/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repository: repoFullName,
        webhook_id: webhookId
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to test webhook: ${response.statusText}`)
    }
  }

  // Setup webhooks automatically for a project
  async setupProjectWebhooks(repoFullName: string): Promise<WebhookResponse> {
    try {
      // Check if webhook already exists
      const existingWebhooks = await this.getRepositoryWebhooks(repoFullName)
      const ourWebhook = existingWebhooks.find(w => 
        w.config.url.includes("/api/webhooks/github")
      )

      if (ourWebhook) {
        console.log(`Webhook already exists for ${repoFullName}`)
        return ourWebhook
      }

      // Create new webhook
      return await this.createWebhook(repoFullName, {})
      
    } catch (error) {
      console.error(`Failed to setup webhooks for ${repoFullName}:`, error)
      throw error
    }
  }
}

export const webhookService = new GitHubWebhookService()