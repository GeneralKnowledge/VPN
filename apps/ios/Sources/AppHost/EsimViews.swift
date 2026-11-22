@preconcurrency import NorthstarVPNFFI
import SwiftUI

#if canImport(CoreTelephony)
    import CoreTelephony
#endif
#if canImport(UIKit)
    import CoreImage
    import CoreImage.CIFilterBuiltins
    import UIKit
#endif

// The eSIM tab: our eSIM packages, bought with their own checkout (never the
// VPN's), the customer's eSIMs, and "Will this phone work?". The rules live
// in rust/src/esim.rs.

// MARK: - eSIM tab

struct EsimScreen: View {
    let model: AppModel
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            List {
                CompatibilitySection()

                if !model.home.esimOrders.isEmpty {
                    Section("Your eSIMs") {
                        ForEach(model.home.esimOrders, id: \.id) { order in
                            NavigationLink(value: EsimRoute.order(order.id)) {
                                OrderRow(order: order)
                            }
                            .accessibilityIdentifier("esim.order.\(order.id)")
                        }
                    }
                }

                Section {
                    if model.home.esimCountries.isEmpty {
                        HStack {
                            Text(model.busy ? "Loading eSIMs…" : "No eSIMs to show. Pull down to try again.")
                            if model.busy {
                                Spacer()
                                ProgressView()
                            }
                        }
                        .foregroundStyle(.secondary)
                    }
                    ForEach(model.home.esimCountries, id: \.code) { country in
                        NavigationLink(value: EsimRoute.country(country.code)) {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(country.name).font(.headline)
                                    Text(country.packageCount == 1 ? "1 plan" : "\(country.packageCount) plans")
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(country.fromPrice).font(.subheadline)
                            }
                        }
                        .accessibilityIdentifier("esim.country.\(country.code)")
                    }
                } header: {
                    Text("Buy an eSIM")
                } footer: {
                    Text("Data for your trip, paid once. Separate from your VPN plan.")
                }
            }
            .navigationTitle("eSIM")
            .navigationDestination(for: EsimRoute.self) { route in
                switch route {
                case .country(let code): EsimCountryScreen(model: model, countryCode: code)
                case .order(let id): EsimOrderScreen(model: model, orderId: id)
                }
            }
            .refreshable {
                await model.loadEsimPackages()
                await model.loadEsimOrders()
            }
            .task {
                if model.home.esimCountries.isEmpty { await model.loadEsimPackages() }
                await model.watchEsimOrders()
            }
            // Back from the browser's checkout: look for the payment.
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { Task { await model.watchEsimOrders() } }
            }
        }
    }
}

enum EsimRoute: Hashable {
    case country(String)
    case order(String)
}

private struct OrderRow: View {
    let order: EsimOrder

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(order.packageName).font(.headline)
                Text(order.allowance).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
            StatusBadge(order: order)
        }
    }
}

private struct StatusBadge: View {
    let order: EsimOrder

    var body: some View {
        HStack(spacing: 4) {
            if order.inProgress { ProgressView().controlSize(.mini) }
            Text(order.statusLabel)
        }
        .font(.caption.weight(.semibold))
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(tint.opacity(0.15), in: Capsule())
        .foregroundStyle(tint)
    }

    private var tint: Color {
        switch order.status {
        case .issued: .green
        case .pending, .issuing, .retrying: .orange
        case .needsReview, .refunding: .red
        case .refunded, .expired, .unknown: .secondary
        }
    }
}

// MARK: - Will this phone work?

private struct CompatibilitySection: View {
    @State private var answer: EsimCompatibility?

    var body: some View {
        Section("Will this phone work?") {
            if let answer {
                Label {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(answer.title).font(.headline)
                        Text(answer.detail).font(.subheadline).foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: icon(answer.verdict))
                        .foregroundStyle(color(answer.verdict))
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("esim.compatibility")
                ForEach(answer.tips, id: \.self) { tip in
                    Text(tip).font(.footnote).foregroundStyle(.secondary)
                }
            } else {
                ProgressView()
            }
        }
        .task { answer = esimCompatibility(modelIdentifier: AppModel.modelIdentifier(), supportsEmbeddedSim: supportsEsim()) }
    }

    private func icon(_ verdict: EsimVerdict) -> String {
        switch verdict {
        case .yes: "checkmark.circle.fill"
        case .no: "xmark.circle.fill"
        case .unsure: "questionmark.circle.fill"
        }
    }

    private func color(_ verdict: EsimVerdict) -> Color {
        switch verdict {
        case .yes: .green
        case .no: .red
        case .unsure: .orange
        }
    }

    /// What iOS says, or nil where it can't answer (the simulator, a Mac).
    private func supportsEsim() -> Bool? {
        #if canImport(CoreTelephony) && os(iOS) && !targetEnvironment(simulator)
            return CTCellularPlanProvisioning().supportsEmbeddedSIM
        #else
            return nil
        #endif
    }
}

// MARK: - A country's plans

struct EsimCountryScreen: View {
    let model: AppModel
    let countryCode: String
    @State private var confirming: EsimPackage?

    var body: some View {
        let packages = model.esimPackages(country: countryCode)
        List {
            Section {
                ForEach(packages, id: \.code) { plan in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(plan.allowance).font(.headline)
                            Text(plan.name).font(.subheadline).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button(plan.price) { confirming = plan }
                            .buttonStyle(.borderedProminent)
                            .disabled(model.busy)
                            .accessibilityLabel("Buy \(plan.allowance) for \(plan.price)")
                            .accessibilityIdentifier("esim.buy.\(plan.code)")
                    }
                }
            } footer: {
                Text("You pay on a secure Stripe page in your browser, then come back here to install.")
            }
        }
        .navigationTitle(packages.first?.countryName ?? countryCode)
        .esimPurchase(model: model, confirming: $confirming)
    }
}

// MARK: - Buying a plan

/// Confirms a plan, starts the eSIM checkout and opens it (or, on a test
/// server, offers the test payment). Used by a country's plans and by a
/// trip's "Stay connected" item: both buy through the same eSIM checkout.
struct EsimPurchase: ViewModifier {
    let model: AppModel
    @Binding var confirming: EsimPackage?
    @Environment(\.openURL) private var openURL
    @State private var testCheckout: EsimCheckout?

    func body(content: Content) -> some View {
        content
            .confirmationDialog(
                confirming.map { "\($0.allowance) for \($0.price)" } ?? "",
                isPresented: Binding(get: { confirming != nil }, set: { if !$0 { confirming = nil } }),
                titleVisibility: .visible,
                presenting: confirming
            ) { plan in
                Button("Continue to Payment") { Task { await buy(plan) } }
                    .accessibilityIdentifier("esim.confirmBuy")
                Button("Cancel", role: .cancel) {}
            } message: { _ in
                Text("Check the phone you'll use is unlocked and supports eSIM first. Your eSIM is ready to install as soon as payment is confirmed.")
            }
            .alert(
                "Test Payment",
                isPresented: Binding(get: { testCheckout != nil }, set: { if !$0 { testCheckout = nil } }),
                presenting: testCheckout
            ) { checkout in
                Button("Complete Test Payment") {
                    Task {
                        await model.completeTestPayment(checkout)
                        await model.watchEsimOrders()
                    }
                }
                .accessibilityIdentifier("esim.completeTestPayment")
                Button("Cancel", role: .cancel) {}
            } message: { checkout in
                Text("This server takes test payments only. No card is charged for \(checkout.price).")
            }
    }

    private func buy(_ plan: EsimPackage) async {
        guard let checkout = await model.buyEsim(plan) else { return }
        if checkout.isTest {
            testCheckout = checkout
        } else if let url = URL(string: checkout.url) {
            openURL(url)
        }
    }
}

extension View {
    func esimPurchase(model: AppModel, confirming: Binding<EsimPackage?>) -> some View {
        modifier(EsimPurchase(model: model, confirming: confirming))
    }
}

// MARK: - One eSIM

struct EsimOrderScreen: View {
    let model: AppModel
    let orderId: String
    @Environment(\.openURL) private var openURL

    var body: some View {
        if let order = model.home.esimOrders.first(where: { $0.id == orderId }) {
            List {
                Section {
                    LabeledContent("Plan", value: order.packageName)
                    LabeledContent("Data", value: order.allowance)
                    LabeledContent("Paid", value: order.price)
                    LabeledContent("Status") { StatusBadge(order: order) }
                    if !order.statusDetail.isEmpty {
                        Text(order.statusDetail).font(.subheadline).foregroundStyle(.secondary)
                    }
                }

                if let profile = order.profile {
                    Section {
                        if let link = profile.installUrl, let url = URL(string: link) {
                            Button {
                                openURL(url)
                            } label: {
                                Label("Install eSIM on This iPhone", systemImage: "simcard")
                            }
                            .accessibilityIdentifier("esim.install")
                        }
                        Text("Install on Wi‑Fi. Each eSIM installs once, so don't delete it after installing.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }

                    Section {
                        QRCodeView(payload: profile.qrPayload, imageURL: profile.qrImageUrl)
                            .frame(maxWidth: .infinity)
                            .accessibilityIdentifier("esim.qr")
                    } header: {
                        Text("Install on another device")
                    } footer: {
                        Text("On the other iPhone: Settings → Mobile Service → Add eSIM → Use QR Code, then scan this.")
                    }

                    Section("Details") {
                        if let iccid = profile.iccid {
                            LabeledContent("ICCID") { Text(iccid).font(.footnote.monospaced()).textSelection(.enabled) }
                        }
                        if let code = profile.activationCode {
                            LabeledContent("Activation code") {
                                Text(code).font(.footnote.monospaced()).textSelection(.enabled)
                            }
                            .accessibilityIdentifier("esim.activationCode")
                        }
                    }
                }
            }
            .navigationTitle(order.packageName)
            .refreshable { await model.loadEsimOrders() }
        } else {
            ContentUnavailableView("eSIM Not Found", systemImage: "simcard")
        }
    }
}

/// The QR code for the activation code, made on the phone; the provider's
/// image when there is no code to draw. The provider's image carries the
/// same secret, so it is fetched with an ephemeral session (no disk cache)
/// and held only by this view, which signing out removes.
private struct QRCodeView: View {
    let payload: String?
    let imageURL: String?
    @State private var providerImage: Image?
    @State private var loading = false

    var body: some View {
        Group {
            if let image = localImage ?? providerImage {
                image.resizable().interpolation(.none).scaledToFit()
            } else if loading {
                ProgressView()
            } else {
                Text("QR code not ready yet").foregroundStyle(.secondary)
            }
        }
        .frame(width: 220, height: 220)
        .padding(8)
        .background(.white)
        .accessibilityLabel("eSIM QR code")
        .task(id: imageURL) { await loadProviderImage() }
    }

    private func loadProviderImage() async {
        #if canImport(UIKit)
            guard payload == nil, let imageURL, let url = URL(string: imageURL) else { return }
            loading = true
            defer { loading = false }
            let data: Data
            if url.scheme == "data" {
                // `data:image/png;base64,…`: nothing to fetch.
                guard let comma = imageURL.firstIndex(of: ","),
                    let decoded = Data(base64Encoded: String(imageURL[imageURL.index(after: comma)...]))
                else { return }
                data = decoded
            } else {
                guard url.scheme == "https" else { return }
                let session = URLSession(configuration: .ephemeral)
                defer { session.finishTasksAndInvalidate() }
                guard let fetched = try? await session.data(from: url) else { return }
                data = fetched.0
            }
            if let image = UIImage(data: data) { providerImage = Image(uiImage: image) }
        #endif
    }

    private var localImage: Image? {
        #if canImport(UIKit)
            guard let payload else { return nil }
            let filter = CIFilter.qrCodeGenerator()
            filter.message = Data(payload.utf8)
            filter.correctionLevel = "M"
            guard let output = filter.outputImage,
                let cg = CIContext().createCGImage(output, from: output.extent)
            else { return nil }
            return Image(uiImage: UIImage(cgImage: cg))
        #else
            return nil
        #endif
    }
}
