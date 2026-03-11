"""Tests for sentiment_analyzer.py — Filing vs news tone comparison."""
import pytest
from sentiment_analyzer import analyze_sentiment, SentimentResult, _score_headline


class TestAnalyzeSentiment:
    """Test sentiment comparison between filing signal and news headlines."""

    def test_risk_filing_negative_news_matches(self):
        result = analyze_sentiment(
            filing_signal="Risk",
            news_headlines=["Stock crashes after earnings miss", "Company faces major decline"],
        )
        assert result.sentiment_match is True
        assert result.sentiment_delta < 0.3
        assert result.news_sentiment_score < 0

    def test_risk_filing_positive_news_conflicts(self):
        result = analyze_sentiment(
            filing_signal="Risk",
            news_headlines=["Stock surges on strong momentum", "Revenue growth exceeds expectations"],
        )
        assert result.sentiment_match is False
        assert result.sentiment_delta > 0
        assert result.news_sentiment_score > 0

    def test_positive_filing_positive_news_matches(self):
        result = analyze_sentiment(
            filing_signal="Positive",
            news_headlines=["Company beats estimates, stock rallies", "Strong growth outlook"],
        )
        assert result.sentiment_match is True
        assert result.sentiment_delta < 0.3

    def test_positive_filing_negative_news_conflicts(self):
        result = analyze_sentiment(
            filing_signal="Positive",
            news_headlines=["Stock plunges amid fraud scandal", "Company faces bankruptcy"],
        )
        assert result.sentiment_match is False
        assert result.sentiment_delta > 0

    def test_neutral_filing_always_matches(self):
        result = analyze_sentiment(
            filing_signal="Neutral",
            news_headlines=["Stock crashes hard", "Everything is terrible"],
        )
        assert result.sentiment_match is True
        assert result.sentiment_delta == 0.0

    def test_no_headlines_returns_neutral(self):
        result = analyze_sentiment(filing_signal="Risk", news_headlines=[])
        assert result.sentiment_delta == 0.0
        assert result.news_sentiment_score == 0.0
        assert result.sentiment_match is True

    def test_returns_valid_dataclass(self):
        result = analyze_sentiment("Positive", ["test headline"])
        assert isinstance(result, SentimentResult)
        assert -1.0 <= result.news_sentiment_score <= 1.0
        assert 0.0 <= result.sentiment_delta <= 1.0

    def test_mixed_headlines(self):
        result = analyze_sentiment(
            filing_signal="Positive",
            news_headlines=["Stock rallies strongly", "Some concerns about growth", "Neutral quarterly report"],
        )
        # Mixed news — should be close to neutral
        assert isinstance(result.sentiment_match, bool)


class TestScoreHeadline:
    """Test individual headline scoring."""

    def test_positive_headline(self):
        score = _score_headline("Stock surges to record high")
        assert score > 0

    def test_negative_headline(self):
        score = _score_headline("Company faces bankruptcy and collapse")
        assert score < 0

    def test_neutral_headline(self):
        score = _score_headline("Company filed quarterly report")
        assert score == 0

    def test_case_insensitive(self):
        score1 = _score_headline("STOCK SURGES")
        score2 = _score_headline("stock surges")
        assert score1 == score2
