// The site's navigation, defined once. Each destination appears in exactly one place in the menus.
export const NAV = [
  { label: "Home", to: "/home" },
  {
    label: "Voters",
    to: "/voters",
    items: [
      { label: "Register as a new voter", note: "Apply for inclusion in the roll", to: "/register" },
      { label: "Find your name in the roll", note: "Search by EPIC number or details", to: "/electoral-roll" },
      { label: "Find your polling station", note: "Where you vote, with facilities and any relocation", to: "/booths" },
      { label: "Track an application", note: "Check a request with its reference ID", to: "/check-request" },
      { label: "Forms and services", note: "Which form do I need?", to: "/voters" }
    ]
  },
  {
    label: "Elections",
    items: [
      { label: "Report a violation", note: "Model Code of Conduct complaints", to: "/report-violation" },
      { label: "Candidates and parties", note: "Nominations, permissions, candidate details", to: "/candidates" },
      { label: "Results and counting", note: "Turnout, rounds and scrutiny", to: "/results" }
    ]
  },
  { label: "States", states: true },
  {
    label: "Information",
    items: [
      { label: "Awareness and media", note: "Publications, EVM questions, voter education", to: "/media" },
      { label: "Roles and access", note: "Who does what, and what each role may do", to: "/roles" }
    ]
  }
];
