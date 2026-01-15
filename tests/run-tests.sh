#!/bin/bash

CONFIG="tests/vitest.config.ts"

run_all() {
    echo "🧪 Running all tests..."
    npx vitest run --config $CONFIG
}

run_critical() {
    echo "🚨 Running critical tests (deployment blockers)..."
    npx vitest run tests/auth/ tests/data-isolation/ tests/security/ --config $CONFIG
}

run_auth() {
    echo "🔐 Running auth tests..."
    npx vitest run tests/auth/ --config $CONFIG
}

run_data_isolation() {
    echo "🔒 Running data isolation tests..."
    npx vitest run tests/data-isolation/ --config $CONFIG
}

run_user() {
    echo "👤 Running user role tests..."
    npx vitest run tests/user/ --config $CONFIG
}

run_manager() {
    echo "👔 Running manager role tests..."
    npx vitest run tests/manager/ --config $CONFIG
}

run_super_admin() {
    echo "🔑 Running super admin tests..."
    npx vitest run tests/super-admin/ --config $CONFIG
}

run_ai() {
    echo "🤖 Running AI tests..."
    npx vitest run tests/ai/ --config $CONFIG
}

run_email() {
    echo "📧 Running email tests..."
    npx vitest run tests/email/ --config $CONFIG
}

run_security() {
    echo "🛡️ Running security tests..."
    npx vitest run tests/security/ --config $CONFIG
}

run_chaos() {
    echo "💥 Running chaos tests..."
    npx vitest run tests/chaos/ --config $CONFIG
}

run_ux() {
    echo "🎨 Running UX tests..."
    npx vitest run tests/ux/ --config $CONFIG
}

run_performance() {
    echo "⚡ Running performance tests..."
    npx vitest run tests/performance/ --config $CONFIG
}

run_watch() {
    echo "👀 Running tests in watch mode..."
    npx vitest --config $CONFIG
}

run_coverage() {
    echo "📊 Running tests with coverage..."
    npx vitest run --config $CONFIG --coverage
}

case "$1" in
    all)
        run_all
        ;;
    critical)
        run_critical
        ;;
    auth)
        run_auth
        ;;
    data-isolation)
        run_data_isolation
        ;;
    user)
        run_user
        ;;
    manager)
        run_manager
        ;;
    super-admin)
        run_super_admin
        ;;
    ai)
        run_ai
        ;;
    email)
        run_email
        ;;
    security)
        run_security
        ;;
    chaos)
        run_chaos
        ;;
    ux)
        run_ux
        ;;
    performance)
        run_performance
        ;;
    watch)
        run_watch
        ;;
    coverage)
        run_coverage
        ;;
    *)
        echo "AiSDR Test Runner"
        echo "================"
        echo ""
        echo "Usage: ./tests/run-tests.sh [command]"
        echo ""
        echo "Commands:"
        echo "  all           - Run all tests"
        echo "  critical      - Run critical tests (auth, data-isolation, security)"
        echo "  auth          - Run authentication tests"
        echo "  data-isolation - Run data isolation tests"
        echo "  user          - Run user role tests"
        echo "  manager       - Run manager role tests"
        echo "  super-admin   - Run super admin tests"
        echo "  ai            - Run AI generation tests"
        echo "  email         - Run email execution tests"
        echo "  security      - Run security tests"
        echo "  chaos         - Run chaos/failure tests"
        echo "  ux            - Run UX failure tests"
        echo "  performance   - Run performance tests"
        echo "  watch         - Run tests in watch mode"
        echo "  coverage      - Run tests with coverage"
        echo ""
        echo "CI/CD Integration:"
        echo "  Run 'critical' tests as deployment blockers"
        echo "  Run 'all' tests for full validation"
        ;;
esac
