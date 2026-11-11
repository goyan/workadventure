import Foundation

private let teamsLinkPattern = try! NSRegularExpression(
    pattern: #"https://teams\.microsoft\.com/(?:l/meetup-join|meet)/[^\s<>"']+"#
)

/// The first Teams meeting link of a text (the notes Exchange gives an invitation), if any.
func teamsLink(in text: String?) -> String? {
    guard let text else { return nil }
    let range = NSRange(text.startIndex..., in: text)
    guard let match = teamsLinkPattern.firstMatch(in: text, range: range),
          let found = Range(match.range, in: text)
    else { return nil }
    return String(text[found])
}
