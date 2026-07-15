import { render, screen, fireEvent } from "@testing-library/react";
import SuiteSwitcher from "../SuiteSwitcher.jsx";

const APPS = [
  { name: "Pulse", url: "https://pulse.example.com" },
  { name: "Tether", url: "https://tether.example.com" },
];

test("renders nothing when no suite apps are configured", () => {
  const { container } = render(<SuiteSwitcher apps={[]} />);
  expect(container).toBeEmptyDOMElement();
});

test("renders nothing when apps prop is omitted", () => {
  const { container } = render(<SuiteSwitcher />);
  expect(container).toBeEmptyDOMElement();
});

test("clicking the icon opens a dropdown listing each configured app as a link", () => {
  render(<SuiteSwitcher apps={APPS} />);
  expect(screen.queryByText("Pulse")).not.toBeInTheDocument();

  fireEvent.click(screen.getByTitle("Switch app"));

  const pulseLink = screen.getByText("Pulse").closest("a");
  const tetherLink = screen.getByText("Tether").closest("a");
  expect(pulseLink).toHaveAttribute("href", "https://pulse.example.com");
  expect(pulseLink).toHaveAttribute("target", "_blank");
  expect(pulseLink).toHaveAttribute("rel", "noopener noreferrer");
  expect(tetherLink).toHaveAttribute("href", "https://tether.example.com");
});

test("clicking outside the dropdown closes it", () => {
  render(
    <div>
      <div data-testid="outside">Outside</div>
      <SuiteSwitcher apps={APPS} />
    </div>
  );

  fireEvent.click(screen.getByTitle("Switch app"));
  expect(screen.getByText("Pulse")).toBeInTheDocument();

  fireEvent.mouseDown(screen.getByTestId("outside"));
  expect(screen.queryByText("Pulse")).not.toBeInTheDocument();
});

test("clicking a suite link closes the dropdown", () => {
  render(<SuiteSwitcher apps={APPS} />);
  fireEvent.click(screen.getByTitle("Switch app"));

  fireEvent.click(screen.getByText("Pulse"));
  expect(screen.queryByText("Tether")).not.toBeInTheDocument();
});

test("renders all configured apps, not just two", () => {
  const sixApps = [
    { name: "Pulse", url: "https://pulse.example.com" },
    { name: "Tether", url: "https://tether.example.com" },
    { name: "Folio", url: "https://folio.example.com" },
    { name: "Forge", url: "https://forge.example.com" },
    { name: "Passvault", url: "https://passvault.example.com" },
    { name: "Scout", url: "https://scout.example.com" },
  ];
  render(<SuiteSwitcher apps={sixApps} />);
  fireEvent.click(screen.getByTitle("Switch app"));

  for (const app of sixApps) {
    expect(screen.getByText(app.name).closest("a")).toHaveAttribute("href", app.url);
  }
});
