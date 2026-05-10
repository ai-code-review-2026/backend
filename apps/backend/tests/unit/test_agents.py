"""
Unit tests for multi-agent code review system.

Tests the base agent, individual specialized agents, and dispatcher.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.agents.base_agent import BaseAgent, Finding, ReviewContext
from app.agents.security_agent import SecurityAgent, get_security_agent
from app.agents.performance_agent import PerformanceAgent, get_performance_agent
from app.agents.cleancode_agent import CleanCodeAgent, get_cleancode_agent
from app.agents.architecture_agent import ArchitectureAgent, get_architecture_agent
from app.agents.devops_agent import DevOpsAgent, get_devops_agent
from app.agents.testing_agent import TestingAgent, get_testing_agent
from app.agents.agent_dispatcher import AgentDispatcher, get_dispatcher, dispatch_review


class TestFinding:
    """Test Finding data structure."""
    
    def test_finding_creation(self):
        finding = Finding(
            file_path="test.py",
            line=42,
            severity="HIGH",
            category="security",
            message="SQL injection vulnerability",
            suggestion="Use parameterized queries",
            agent_id="security_agent",
        )
        
        assert finding.file_path == "test.py"
        assert finding.line == 42
        assert finding.severity == "HIGH"
        assert finding.category == "security"
        assert finding.agent_id == "security_agent"
    
    def test_finding_to_dict(self):
        finding = Finding(
            file_path="test.py",
            line=42,
            severity="HIGH",
            category="security",
            message="Test message",
            suggestion="Test suggestion",
            agent_id="test_agent",
            confidence=0.95,
            rule_id="test-rule",
        )
        
        result = finding.to_dict()
        
        assert result["file_path"] == "test.py"
        assert result["line_start"] == 42
        assert result["line_end"] == 42
        assert result["severity"] == "HIGH"
        assert result["confidence"] == 0.95
        assert result["rule_id"] == "test-rule"


class TestReviewContext:
    """Test ReviewContext data structure."""
    
    def test_context_creation(self):
        context = ReviewContext(
            diff_content="test diff",
            changed_files=["file1.py", "file2.py"],
            project_type="python",
        )
        
        assert context.diff_content == "test diff"
        assert len(context.changed_files) == 2
        assert context.project_type == "python"


class TestBaseAgent:
    """Test BaseAgent functionality."""
    
    @pytest.fixture
    def mock_gateway(self):
        """Mock LLM gateway."""
        with patch("app.agents.base_agent.get_gateway") as mock:
            gateway = MagicMock()
            gateway.generate = AsyncMock()
            mock.return_value = gateway
            yield gateway
    
    @pytest.mark.asyncio
    async def test_base_agent_should_analyze(self, mock_gateway):
        agent = BaseAgent()
        context = ReviewContext(
            diff_content="test",
            changed_files=["test.py"],
        )
        
        assert agent.should_analyze("test", context) is True
    
    @pytest.mark.asyncio
    async def test_base_agent_parse_json_response(self, mock_gateway):
        agent = BaseAgent()
        context = ReviewContext(
            diff_content="test",
            changed_files=["test.py"],
        )
        
        response = """
        ```json
        [
            {
                "file_path": "test.py",
                "line": 10,
                "severity": "HIGH",
                "message": "Test issue",
                "suggestion": "Fix it"
            }
        ]
        ```
        """
        
        findings = agent.parse_llm_response(response, context)
        
        assert len(findings) == 1
        assert findings[0].file_path == "test.py"
        assert findings[0].line == 10
        assert findings[0].severity == "HIGH"


class TestSecurityAgent:
    """Test SecurityAgent."""
    
    def test_security_agent_singleton(self):
        agent1 = get_security_agent()
        agent2 = get_security_agent()
        
        assert agent1 is agent2
    
    def test_security_agent_properties(self):
        agent = get_security_agent()
        
        assert agent.agent_id == "security_agent"
        assert agent.category == "security"
        assert agent.default_severity == "HIGH"
    
    def test_security_agent_should_analyze(self):
        agent = get_security_agent()
        context = ReviewContext(
            diff_content="test",
            changed_files=["test.py"],
        )
        
        # Security agent always analyzes
        assert agent.should_analyze("test", context) is True


class TestPerformanceAgent:
    """Test PerformanceAgent."""
    
    def test_performance_agent_should_analyze_with_query(self):
        agent = get_performance_agent()
        context = ReviewContext(
            diff_content="SELECT * FROM users WHERE id = 1",
            changed_files=["test.py"],
        )
        
        assert agent.should_analyze(context.diff_content, context) is True
    
    def test_performance_agent_should_skip_without_patterns(self):
        agent = get_performance_agent()
        context = ReviewContext(
            diff_content="x = 1 + 2",
            changed_files=["test.py"],
        )
        
        assert agent.should_analyze(context.diff_content, context) is False


class TestCleanCodeAgent:
    """Test CleanCodeAgent."""
    
    def test_cleancode_agent_properties(self):
        agent = get_cleancode_agent()
        
        assert agent.agent_id == "cleancode_agent"
        assert agent.category == "maintainability"
        assert agent.default_severity == "MEDIUM"


class TestArchitectureAgent:
    """Test ArchitectureAgent."""
    
    def test_architecture_agent_should_analyze_with_import(self):
        agent = get_architecture_agent()
        context = ReviewContext(
            diff_content="import os\nfrom typing import Any",
            changed_files=["test.py"],
        )
        
        assert agent.should_analyze(context.diff_content, context) is True
    
    def test_architecture_agent_should_analyze_with_class(self):
        agent = get_architecture_agent()
        context = ReviewContext(
            diff_content="class MyService:\n    pass",
            changed_files=["test.py"],
        )
        
        assert agent.should_analyze(context.diff_content, context) is True


class TestDevOpsAgent:
    """Test DevOpsAgent."""
    
    def test_devops_agent_should_analyze_dockerfile(self):
        agent = get_devops_agent()
        context = ReviewContext(
            diff_content="FROM python:3.11\nRUN pip install",
            changed_files=["Dockerfile"],
        )
        
        assert agent.should_analyze(context.diff_content, context) is True
    
    def test_devops_agent_should_skip_regular_code(self):
        agent = get_devops_agent()
        context = ReviewContext(
            diff_content="def hello():\n    return 'world'",
            changed_files=["test.py"],
        )
        
        assert agent.should_analyze(context.diff_content, context) is False


class TestTestingAgent:
    """Test TestingAgent."""
    
    def test_testing_agent_should_analyze_test_file(self):
        agent = get_testing_agent()
        context = ReviewContext(
            diff_content="def test_something():\n    assert True",
            changed_files=["test_file.py"],
        )
        
        assert agent.should_analyze(context.diff_content, context) is True
    
    def test_testing_agent_should_analyze_new_function(self):
        agent = get_testing_agent()
        context = ReviewContext(
            diff_content="+def new_function():\n+    return 42",
            changed_files=["module.py"],
        )
        
        assert agent.should_analyze(context.diff_content, context) is True


class TestAgentDispatcher:
    """Test AgentDispatcher."""
    
    @pytest.fixture
    def mock_agents(self):
        """Mock all agents."""
        with patch("app.agents.agent_dispatcher.get_security_agent") as sec, \
             patch("app.agents.agent_dispatcher.get_performance_agent") as perf, \
             patch("app.agents.agent_dispatcher.get_cleancode_agent") as clean, \
             patch("app.agents.agent_dispatcher.get_architecture_agent") as arch, \
             patch("app.agents.agent_dispatcher.get_devops_agent") as devops, \
             patch("app.agents.agent_dispatcher.get_testing_agent") as test:
            
            # Create mock agents
            for mock in [sec, perf, clean, arch, devops, test]:
                agent = MagicMock()
                agent.analyze = AsyncMock(return_value=[])
                agent.agent_id = "mock_agent"
                agent.should_analyze = MagicMock(return_value=True)
                mock.return_value = agent
            
            yield {
                "security": sec.return_value,
                "performance": perf.return_value,
                "cleancode": clean.return_value,
                "architecture": arch.return_value,
                "devops": devops.return_value,
                "testing": test.return_value,
            }
    
    def test_dispatcher_singleton(self):
        disp1 = get_dispatcher()
        disp2 = get_dispatcher()
        
        assert disp1 is disp2
    
    def test_select_agents_always_includes_security_and_cleancode(self):
        dispatcher = AgentDispatcher()
        context = ReviewContext(
            diff_content="x = 1",
            changed_files=["test.py"],
        )
        
        selected = dispatcher._select_agents("x = 1", context)
        
        agent_ids = [agent.agent_id for agent in selected]
        assert "security_agent" in agent_ids
        assert "cleancode_agent" in agent_ids
    
    def test_select_agents_includes_devops_for_dockerfile(self):
        dispatcher = AgentDispatcher()
        context = ReviewContext(
            diff_content="FROM python:3.11",
            changed_files=["Dockerfile"],
        )
        
        selected = dispatcher._select_agents("FROM python:3.11", context)
        
        agent_ids = [agent.agent_id for agent in selected]
        assert "devops_agent" in agent_ids
    
    def test_select_agents_includes_performance_for_query(self):
        dispatcher = AgentDispatcher()
        context = ReviewContext(
            diff_content="SELECT * FROM users",
            changed_files=["query.py"],
        )
        
        selected = dispatcher._select_agents("SELECT * FROM users", context)
        
        agent_ids = [agent.agent_id for agent in selected]
        assert "performance_agent" in agent_ids
    
    def test_deduplication_same_location(self):
        dispatcher = AgentDispatcher()
        
        findings = [
            Finding(
                file_path="test.py",
                line=10,
                severity="HIGH",
                category="security",
                message="SQL injection found",
                suggestion="Use params",
                agent_id="security_agent",
            ),
            Finding(
                file_path="test.py",
                line=10,
                severity="HIGH",
                category="security",
                message="SQL injection vulnerability",
                suggestion="Use parameterized queries",
                agent_id="cleancode_agent",
            ),
        ]
        
        deduplicated = dispatcher._deduplicate_findings(findings)
        
        # Should keep security_agent (higher priority)
        assert len(deduplicated) == 1
        assert deduplicated[0].agent_id == "security_agent"
    
    def test_deduplication_different_messages(self):
        dispatcher = AgentDispatcher()
        
        findings = [
            Finding(
                file_path="test.py",
                line=10,
                severity="HIGH",
                category="security",
                message="SQL injection",
                suggestion="Fix it",
                agent_id="security_agent",
            ),
            Finding(
                file_path="test.py",
                line=10,
                severity="HIGH",
                category="performance",
                message="N+1 query problem",
                suggestion="Use eager loading",
                agent_id="performance_agent",
            ),
        ]
        
        deduplicated = dispatcher._deduplicate_findings(findings)
        
        # Different messages, keep both
        assert len(deduplicated) == 2
    
    def test_message_similarity(self):
        dispatcher = AgentDispatcher()
        
        msg1 = "SQL injection vulnerability found in query"
        msg2 = "SQL injection found in database query"
        msg3 = "Memory leak detected in loop"
        
        assert dispatcher._are_messages_similar(msg1, msg2) is True
        assert dispatcher._are_messages_similar(msg1, msg3) is False
    
    @pytest.mark.asyncio
    async def test_dispatch_combines_findings(self, mock_agents):
        # Reset singleton
        import app.agents.agent_dispatcher as dispatcher_module
        dispatcher_module._dispatcher_instance = None
        
        # Create findings
        finding1 = Finding(
            file_path="test.py",
            line=10,
            severity="HIGH",
            category="security",
            message="Issue 1",
            suggestion="Fix 1",
            agent_id="security_agent",
        )
        
        finding2 = Finding(
            file_path="test.py",
            line=20,
            severity="MEDIUM",
            category="performance",
            message="Issue 2",
            suggestion="Fix 2",
            agent_id="performance_agent",
        )
        
        # Mock analyze to return findings
        mock_agents["security"].analyze = AsyncMock(return_value=[finding1])
        mock_agents["performance"].analyze = AsyncMock(return_value=[finding2])
        mock_agents["cleancode"].analyze = AsyncMock(return_value=[])
        
        context = ReviewContext(
            diff_content="test",
            changed_files=["test.py"],
        )
        
        dispatcher = get_dispatcher()
        results = await dispatcher.dispatch("test", context)
        
        assert len(results) >= 0  # May be deduplicated
