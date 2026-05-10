/**
 * Tests E2E pour le workflow complet du système de Reviewers
 *
 * Ces tests couvrent :
 * - Navigation et permissions par niveau de reviewer
 * - Queue management et auto-assignation
 * - Processus de review avec commentaires et décisions
 * - Métriques et analytics
 * - Templates et settings
 */

describe('Reviewer Workflow', () => {
  // Setup et utilitaires
  const reviewerUsers = {
    junior: 'junior@example.com',
    senior: 'senior@example.com',
    lead: 'lead@example.com'
  }

  const mockAnalysis = {
    id: 'ana_test_123',
    repo: 'test/repository',
    pr_number: '42',
    author: 'dev@example.com'
  }

  beforeEach(() => {
    // Mock des API calls pour éviter les dépendances
    cy.intercept('GET', '/api/v1/reviews/queue*', {
      fixture: 'reviewer-queue.json'
    }).as('getQueue')

    cy.intercept('GET', '/api/v1/reviews/metrics/personal*', {
      fixture: 'reviewer-metrics.json'
    }).as('getPersonalMetrics')

    cy.intercept('GET', '/api/v1/reviews/metrics/team*', {
      fixture: 'team-metrics.json'
    }).as('getTeamMetrics')
  })

  describe('Navigation and Permissions', () => {
    it('should show correct navigation for Junior Reviewer', () => {
      cy.loginAs(reviewerUsers.junior, 'reviewer_junior')
      cy.visit('/dashboard')

      // Verify redirect to reviewer dashboard
      cy.url().should('include', '/dashboard/reviewer')

      // Check navigation items
      cy.get('[data-testid="nav-sidebar"]').within(() => {
        cy.contains('Review Management').should('be.visible')
        cy.contains('Dashboard').should('be.visible')
        cy.contains('Review Queue').should('be.visible')
        cy.contains('My Reviews').should('be.visible')
        cy.contains('Analytics').should('be.visible')
        cy.contains('Settings').should('be.visible')

        // Junior reviewers should NOT see team analytics and templates
        cy.contains('Team Analytics').should('not.exist')
        cy.contains('Templates').should('not.exist')
      })
    })

    it('should show full navigation for Lead Reviewer', () => {
      cy.loginAs(reviewerUsers.lead, 'reviewer_lead')
      cy.visit('/dashboard/reviewer')

      cy.get('[data-testid="nav-sidebar"]').within(() => {
        // Lead should see all items including restricted ones
        cy.contains('Team Analytics').should('be.visible')
        cy.contains('Templates').should('be.visible')
      })
    })

    it('should restrict access to team analytics for Junior Reviewer', () => {
      cy.loginAs(reviewerUsers.junior, 'reviewer_junior')
      cy.visit('/dashboard/reviewer/team-analytics')

      cy.get('[data-testid="access-restricted"]').should('be.visible')
      cy.contains('Access Restricted').should('be.visible')
      cy.contains('Team analytics are only available to Lead Reviewers').should('be.visible')
    })
  })

  describe('Review Queue Management', () => {
    beforeEach(() => {
      cy.loginAs(reviewerUsers.senior, 'reviewer_senior')
    })

    it('should display reviewer queue with pending reviews', () => {
      cy.visit('/dashboard/reviewer/queue')
      cy.wait('@getQueue')

      // Check queue stats
      cy.get('[data-testid="pending-reviews"]').should('contain', '5')
      cy.get('[data-testid="overdue-reviews"]').should('contain', '1')

      // Check queue table
      cy.get('[data-testid="queue-table"]').should('be.visible')
      cy.get('[data-testid="queue-item"]').should('have.length.at.least', 1)

      // Check filtering
      cy.get('[data-testid="filter-status"]').select('Pending')
      cy.get('[data-testid="filter-priority"]').select('High')
    })

    it('should allow claiming a review from available queue', () => {
      cy.visit('/dashboard/reviewer/queue')

      // Switch to Available tab
      cy.get('[data-testid="queue-tabs"]').within(() => {
        cy.contains('Available').click()
      })

      // Claim first available review
      cy.get('[data-testid="available-review"]').first().within(() => {
        cy.get('[data-testid="claim-review-btn"]').click()
      })

      // Verify success message
      cy.get('[data-testid="review-claimed-toast"]').should('be.visible')
      cy.contains('Review claimed successfully').should('be.visible')

      // Should redirect to review page or update queue
      cy.url().should('match', /(\/dashboard\/review\/|\/dashboard\/reviewer\/queue)/)
    })

    it('should show capacity warnings when overloaded', () => {
      // Mock API to return high workload
      cy.intercept('GET', '/api/v1/reviews/queue*', {
        body: {
          assigned: Array(8).fill({}), // 8 reviews when capacity is 5
          stats: { pending_count: 8, overdue_count: 2 }
        }
      }).as('getOverloadedQueue')

      cy.visit('/dashboard/reviewer/queue')
      cy.wait('@getOverloadedQueue')

      cy.get('[data-testid="capacity-warning"]').should('be.visible')
      cy.contains('You are over capacity').should('be.visible')
    })
  })

  describe('Review Process', () => {
    beforeEach(() => {
      cy.loginAs(reviewerUsers.senior, 'reviewer_senior')
    })

    it('should complete full review workflow with comments and decision', () => {
      // Mock review analysis data
      cy.intercept('GET', `/api/v1/analyses/${mockAnalysis.id}`, {
        fixture: 'analysis-details.json'
      }).as('getAnalysis')

      cy.intercept('POST', '/api/v1/reviews/comments', {
        body: { id: 'comment_123', status: 'created' }
      }).as('createComment')

      cy.intercept('POST', `/api/v1/reviews/decisions/${mockAnalysis.id}`, {
        body: { id: 'decision_123', decision: 'APPROVE' }
      }).as('submitDecision')

      cy.visit(`/dashboard/review/${mockAnalysis.id}`)
      cy.wait('@getAnalysis')

      // Start review timer
      cy.get('[data-testid="start-review-btn"]').click()
      cy.get('[data-testid="review-timer"]').should('contain', '00:01')

      // Add inline comment
      cy.get('[data-testid="diff-container"]').within(() => {
        cy.get('.diff-line').first().click()
      })

      cy.get('[data-testid="add-comment-modal"]').should('be.visible')
      cy.get('textarea[name="content"]').type('This function needs better error handling')
      cy.get('select[name="comment_type"]').select('suggestion')
      cy.get('[data-testid="submit-comment-btn"]').click()
      cy.wait('@createComment')

      // Verify comment appears inline
      cy.get('[data-testid="inline-comment"]').should('contain', 'This function needs better error handling')

      // Complete review with approval
      cy.get('[data-testid="complete-review-btn"]').click()
      cy.get('[data-testid="decision-modal"]').should('be.visible')

      cy.get('input[value="approve"]').check()
      cy.get('textarea[name="summary"]').type('Code looks good with minor suggestions for improvement')
      cy.get('[data-testid="submit-decision-btn"]').click()
      cy.wait('@submitDecision')

      // Verify redirect to completed reviews
      cy.url().should('include', '/dashboard/reviewer/my-reviews')
      cy.get('[data-testid="completed-reviews"]').should('contain', mockAnalysis.id)
    })

    it('should prevent Junior Reviewer from blocking reviews', () => {
      cy.loginAs(reviewerUsers.junior, 'reviewer_junior')
      cy.visit(`/dashboard/review/${mockAnalysis.id}`)

      cy.get('[data-testid="complete-review-btn"]').click()
      cy.get('[data-testid="decision-modal"]').should('be.visible')

      // Block option should be disabled for junior reviewers
      cy.get('input[value="block"]').should('be.disabled')

      // Only approve and warn should be available
      cy.get('input[value="approve"]').should('not.be.disabled')
      cy.get('input[value="warn"]').should('not.be.disabled')
    })

    it('should create and resolve change requests', () => {
      cy.intercept('POST', '/api/v1/reviews/change-requests', {
        body: { id: 'cr_123', status: 'created' }
      }).as('createChangeRequest')

      cy.loginAs(reviewerUsers.senior, 'reviewer_senior')
      cy.visit(`/dashboard/review/${mockAnalysis.id}`)

      // Open change request panel
      cy.get('[data-testid="change-request-btn"]').click()
      cy.get('[data-testid="change-request-modal"]').should('be.visible')

      // Fill change request form
      cy.get('input[name="title"]').type('Improve error handling')
      cy.get('textarea[name="description"]').type('The current error handling is insufficient for production use')
      cy.get('select[name="category"]').select('quality')
      cy.get('select[name="priority"]').select('medium')

      cy.get('[data-testid="submit-change-request-btn"]').click()
      cy.wait('@createChangeRequest')

      // Verify change request appears in sidebar
      cy.get('[data-testid="change-requests-sidebar"]').should('contain', 'Improve error handling')
    })
  })

  describe('Metrics and Analytics', () => {
    beforeEach(() => {
      cy.loginAs(reviewerUsers.senior, 'reviewer_senior')
    })

    it('should display personal analytics with charts', () => {
      cy.visit('/dashboard/reviewer/analytics')
      cy.wait('@getPersonalMetrics')

      // Check KPI cards
      cy.get('[data-testid="kpi-reviews-completed"]').should('contain', '23')
      cy.get('[data-testid="kpi-avg-review-time"]').should('contain', '45m')
      cy.get('[data-testid="kpi-sla-compliance"]').should('contain', '96%')
      cy.get('[data-testid="kpi-avg-comments"]').should('contain', '8.5')

      // Check charts are rendered
      cy.get('[data-testid="reviews-trend-chart"]').should('be.visible')
      cy.get('[data-testid="decisions-pie-chart"]').should('be.visible')
      cy.get('[data-testid="review-time-trend"]').should('be.visible')
      cy.get('[data-testid="sla-compliance-chart"]').should('be.visible')

      // Test period selector
      cy.get('[data-testid="period-selector"]').select('90')
      cy.wait('@getPersonalMetrics')
    })

    it('should display team analytics for Lead Reviewer', () => {
      cy.loginAs(reviewerUsers.lead, 'reviewer_lead')
      cy.visit('/dashboard/reviewer/team-analytics')
      cy.wait('@getTeamMetrics')

      // Check team overview
      cy.get('[data-testid="team-members-count"]').should('contain', '5')
      cy.get('[data-testid="total-reviews"]').should('contain', '156')
      cy.get('[data-testid="team-sla"]').should('contain', '94%')

      // Check leaderboard
      cy.get('[data-testid="leaderboard-tab"]').click()
      cy.get('[data-testid="leaderboard-table"]').should('be.visible')
      cy.get('[data-testid="leaderboard-metric-selector"]').select('avg_review_time_minutes')

      // Should show different rankings for different metrics
      cy.get('[data-testid="leaderboard-entry"]').should('have.length.at.least', 3)
    })
  })

  describe('Templates Management', () => {
    beforeEach(() => {
      cy.loginAs(reviewerUsers.lead, 'reviewer_lead')
    })

    it('should create and use custom template', () => {
      cy.intercept('POST', '/api/v1/reviews/templates', {
        body: { id: 'template_123', name: 'Custom Security Review' }
      }).as('createTemplate')

      cy.visit('/dashboard/reviewer/templates')

      // Create new template
      cy.get('[data-testid="create-template-btn"]').click()
      cy.get('[data-testid="template-editor-modal"]').should('be.visible')

      // Fill template form
      cy.get('input[name="name"]').type('Custom Security Review')
      cy.get('textarea[name="description"]').type('Comprehensive security review checklist')
      cy.get('select[name="category"]').select('security')

      // Add checklist items
      cy.get('[data-testid="add-checklist-item"]').click()
      cy.get('input[name="checklist_items[0].label"]').type('Check for SQL injection vulnerabilities')
      cy.get('input[name="checklist_items[0].description"]').type('Ensure all database queries use parameterized statements')

      // Save template
      cy.get('[data-testid="save-template-btn"]').click()
      cy.wait('@createTemplate')

      // Verify template appears in list
      cy.get('[data-testid="template-card"]').should('contain', 'Custom Security Review')
    })

    it('should filter templates by category', () => {
      cy.visit('/dashboard/reviewer/templates')

      // Test search
      cy.get('[data-testid="template-search"]').type('security')
      cy.get('[data-testid="template-card"]').should('contain', 'Security Review')

      // Test category filter
      cy.get('[data-testid="template-search"]').clear()
      cy.get('[data-testid="category-filter"]').select('performance')
      cy.get('[data-testid="template-card"]').should('contain', 'Performance Review')
    })

    it('should duplicate system template', () => {
      cy.visit('/dashboard/reviewer/templates')

      cy.get('[data-testid="template-card"]').first().within(() => {
        cy.get('[data-testid="duplicate-btn"]').click()
      })

      cy.get('[data-testid="template-editor-modal"]').should('be.visible')
      cy.get('input[name="name"]').should('contain', '(Copy)')
    })
  })

  describe('Settings and Preferences', () => {
    beforeEach(() => {
      cy.loginAs(reviewerUsers.senior, 'reviewer_senior')
    })

    it('should update reviewer settings', () => {
      cy.intercept('PATCH', '/api/v1/users/profile', {
        body: { status: 'updated' }
      }).as('updateSettings')

      cy.visit('/dashboard/reviewer/settings')

      // Update capacity
      cy.get('input[name="reviewer_capacity"]').clear().type('8')

      // Toggle specialties
      cy.get('[data-testid="specialty-frontend"]').click()
      cy.get('[data-testid="specialty-security"]').click()

      // Change availability status
      cy.get('[data-testid="availability-selector"]').select('away')

      // Update notification preferences
      cy.get('[data-testid="email-notifications"]').within(() => {
        cy.get('input[name="daily_digest"]').check()
      })

      // Save settings
      cy.get('[data-testid="save-settings-btn"]').click()
      cy.wait('@updateSettings')

      cy.get('[data-testid="settings-saved-toast"]').should('be.visible')
    })

    it('should configure auto-assignment preferences', () => {
      cy.visit('/dashboard/reviewer/settings')

      // Enable auto-assignment
      cy.get('[data-testid="auto-assign-toggle"]').check()

      // Configure priority levels
      cy.get('[data-testid="priority-critical"]').click()
      cy.get('[data-testid="priority-high"]').click()
      cy.get('[data-testid="priority-medium"]').click()

      // Enable specialty matching
      cy.get('[data-testid="match-specialties-toggle"]').check()

      cy.get('[data-testid="save-settings-btn"]').click()
    })
  })

  describe('Real-time Collaboration', () => {
    beforeEach(() => {
      cy.loginAs(reviewerUsers.senior, 'reviewer_senior')
    })

    it('should start live review session', () => {
      cy.intercept('POST', '/api/v1/reviews/sessions', {
        body: { id: 'session_123', status: 'active' }
      }).as('createSession')

      cy.visit(`/dashboard/review/${mockAnalysis.id}`)

      // Start live session
      cy.get('[data-testid="start-live-session-btn"]').click()
      cy.wait('@createSession')

      cy.get('[data-testid="live-session-indicator"]').should('be.visible')
      cy.contains('Live session active').should('be.visible')
    })

    it('should show real-time comment updates', () => {
      // Mock WebSocket connection
      cy.window().then((win) => {
        win.mockWebSocket = true
      })

      cy.visit(`/dashboard/review/${mockAnalysis.id}`)

      // Simulate real-time comment from another user
      cy.window().trigger('websocket:message', {
        detail: {
          type: 'comment_created',
          comment: {
            id: 'comment_456',
            author: 'colleague@example.com',
            content: 'I noticed this issue too',
            file_path: 'src/main.js',
            line_start: 15
          }
        }
      })

      // Comment should appear without refresh
      cy.get('[data-testid="inline-comment"]').should('contain', 'I noticed this issue too')
    })
  })

  describe('Performance and Error Handling', () => {
    it('should handle API errors gracefully', () => {
      cy.intercept('GET', '/api/v1/reviews/queue*', {
        statusCode: 500,
        body: { error: 'Internal server error' }
      }).as('getQueueError')

      cy.loginAs(reviewerUsers.senior, 'reviewer_senior')
      cy.visit('/dashboard/reviewer/queue')
      cy.wait('@getQueueError')

      cy.get('[data-testid="error-message"]').should('be.visible')
      cy.contains('Failed to load queue').should('be.visible')

      // Error retry should work
      cy.get('[data-testid="retry-btn"]').click()
    })

    it('should handle offline state', () => {
      cy.loginAs(reviewerUsers.senior, 'reviewer_senior')
      cy.visit('/dashboard/reviewer/queue')

      // Simulate offline
      cy.window().then((win) => {
        win.navigator.onLine = false
        win.dispatchEvent(new Event('offline'))
      })

      cy.get('[data-testid="offline-indicator"]').should('be.visible')
      cy.contains('You are currently offline').should('be.visible')
    })

    it('should handle slow loading states', () => {
      // Slow API response
      cy.intercept('GET', '/api/v1/reviews/metrics/personal*', (req) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ fixture: 'reviewer-metrics.json' })
          }, 3000)
        })
      }).as('getSlowMetrics')

      cy.loginAs(reviewerUsers.senior, 'reviewer_senior')
      cy.visit('/dashboard/reviewer/analytics')

      // Should show loading state
      cy.get('[data-testid="loading-spinner"]').should('be.visible')
      cy.get('[data-testid="metrics-skeleton"]').should('be.visible')

      cy.wait('@getSlowMetrics', { timeout: 5000 })
      cy.get('[data-testid="loading-spinner"]').should('not.exist')
    })
  })
})

// Helper commands for reviewer testing
Cypress.Commands.add('loginAs', (email: string, role: string) => {
  cy.session([email, role], () => {
    // Mock authentication
    cy.window().then((win) => {
      win.localStorage.setItem('user', JSON.stringify({
        id: `user_${role}`,
        email,
        name: email.split('@')[0],
        role,
        avatar: email.charAt(0).toUpperCase()
      }))
    })

    cy.visit('/dashboard')
  })
})
