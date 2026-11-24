package com.billing.pos;

import com.billing.admin.AdminService;
import com.billing.admin.dto.CompanyDetailsData;
import com.billing.common.JdbcPageHelper;
import com.billing.core.pagination.PageResult;
import com.billing.master.dto.NamedItemData;
import com.billing.pos.dto.BillingListItemData;
import com.billing.pos.dto.BillingMenuData;
import com.billing.pos.dto.BillingOptionsData;
import com.billing.pos.dto.CustomerData;
import com.billing.pos.dto.EditBillLoadData;
import com.billing.pos.dto.GalleryPhotoData;
import com.billing.pos.dto.MonthBillCard;
import com.billing.pos.dto.PrintBillData;
import com.billing.pos.dto.ProductHistoryData;
import com.billing.pos.dto.ProductLookupData;
import com.billing.pos.dto.QuotationData;
import com.billing.pos.dto.QuotationEditData;
import com.billing.pos.dto.QuotationLineData;
import com.billing.pos.dto.RecentBillData;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class BillingReadService {

    private static final String GOLD_COLS =
            "IFNULL(d.wastage_per, 0) AS wastage_per, IFNULL(d.stone_wt, 0) AS stone_wt, " +
            "IFNULL(d.stone_wastage, 0) AS stone_wastage, IFNULL(d.stone_cost, 0) AS stone_cost, " +
            "IFNULL(d.gram_rate, 0) AS gram_rate, IFNULL(d.charge_type, '') AS charge_type, " +
            "IFNULL(d.charge_amt, 0) AS charge_amt, IFNULL(d.item_details, '') AS item_details";

    private final JdbcTemplate jdbcTemplate;
    private volatile boolean quotationFlagsReady;

    @PostConstruct
    public void ensureQuotationFlags() {
        if (quotationFlagsReady) {
            return;
        }
        addQuotationColumn("is_tax_bill", "TINYINT NOT NULL DEFAULT 1");
        addQuotationColumn("is_commission", "TINYINT NOT NULL DEFAULT 0");
        addBillColumn("exchPoint", "DOUBLE(10,3) NOT NULL DEFAULT 0.000");
        addTableColumn("prod_bill_details", "image1", "VARCHAR(255) NULL");
        addTableColumn("prod_bill_details", "image2", "VARCHAR(255) NULL");
        addTableColumn("prod_bill_details", "metal_wt", "DOUBLE(10,3) NOT NULL DEFAULT 0.000");
        addTableColumn("prod_bill_details", "item_size", "VARCHAR(50) NULL");
        addTableColumn("prod_bill_details", "purity", "DOUBLE(10,3) NOT NULL DEFAULT 0.000");
        addGoldColumns("prod_bill_details");
        addTableColumn("prod_quotation_details", "image1", "VARCHAR(255) NULL");
        addTableColumn("prod_quotation_details", "image2", "VARCHAR(255) NULL");
        addTableColumn("prod_quotation_details", "metal_wt", "DOUBLE(10,3) NOT NULL DEFAULT 0.000");
        addTableColumn("prod_quotation_details", "item_size", "VARCHAR(50) NULL");
        addTableColumn("prod_quotation_details", "purity", "DOUBLE(10,3) NOT NULL DEFAULT 0.000");
        addGoldColumns("prod_quotation_details");
        addBillColumn("advance_used", "DOUBLE(10,3) NOT NULL DEFAULT 0.000");
        backfillAdvanceUsed();
        quotationFlagsReady = true;
    }

    private void addQuotationColumn(String name, String definition) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prod_quotation' AND COLUMN_NAME = ?",
                Integer.class,
                name
        );
        if (count == null || count == 0) {
            jdbcTemplate.execute("ALTER TABLE prod_quotation ADD COLUMN " + name + " " + definition);
        }
    }

    private void addBillColumn(String name, String definition) {
        addTableColumn("prod_bill", name, definition);
    }

    private void backfillAdvanceUsed() {
        try {
            jdbcTemplate.update(
                    "UPDATE prod_bill b LEFT JOIN prod_bill_payment p ON p.bill_id = b.id " +
                            "SET b.advance_used = GREATEST(0, IFNULL(b.paid, 0) - IFNULL(p.cash, 0) - IFNULL(p.bank, 0))"
            );
        } catch (Exception ignored) {
            // column added on this boot; next request will fill it
        }
    }

    private void addGoldColumns(String table) {
        addTableColumn(table, "wastage_per", "DOUBLE(10,3) NOT NULL DEFAULT 0.000");
        addTableColumn(table, "stone_wt", "DOUBLE(10,3) NOT NULL DEFAULT 0.000");
        addTableColumn(table, "stone_wastage", "DOUBLE(10,3) NOT NULL DEFAULT 0.000");
        addTableColumn(table, "stone_cost", "DOUBLE(12,2) NOT NULL DEFAULT 0.00");
        addTableColumn(table, "gram_rate", "DOUBLE(12,2) NOT NULL DEFAULT 0.00");
        addTableColumn(table, "charge_type", "VARCHAR(80) NULL");
        addTableColumn(table, "charge_amt", "DOUBLE(12,2) NOT NULL DEFAULT 0.00");
        addTableColumn(table, "item_details", "TEXT NULL");
    }

    private void addTableColumn(String table, String name, String definition) {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                    Integer.class,
                    table,
                    name
            );
            if (count == null || count == 0) {
                jdbcTemplate.execute("ALTER TABLE " + table + " ADD COLUMN " + name + " " + definition);
            }
        } catch (Exception ignored) {
            // existing databases keep going until the column can be added
        }
    }
    private final AdminService adminService;

    public BillingOptionsData options(Long userId) {
        Integer discPer = 100;
        try {
            discPer = jdbcTemplate.queryForObject(
                    "SELECT IFNULL(disc_per, 100) FROM users WHERE id = ?",
                    Integer.class,
                    userId
            );
        } catch (Exception ignored) {
            discPer = 100;
        }
        Integer permCount = 0;
        try {
            permCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM user_special_permission WHERE user_id = ? AND content_id = 1",
                    Integer.class,
                    userId
            );
        } catch (Exception ignored) {
            permCount = 0;
        }
        BillingOptionsData data = new BillingOptionsData();
        data.setDiscPer(discPer == null ? 100 : discPer);
        data.setCanBillWithoutStock(permCount != null && permCount > 0);
        var company = adminService.company();
        Integer billingType = company.getBillingType();
        data.setBillingType(billingType != null && billingType == 2 ? 2 : 1);
        Integer editablePrice = company.getIsEditablePrice();
        data.setIsEditablePrice(editablePrice != null && editablePrice == 1 ? 1 : 0);
        return data;
    }

    public BillingMenuData menu() {
        BillingMenuData data = new BillingMenuData();
        data.setCategories(jdbcTemplate.query(
                "SELECT id, NAME AS name FROM prod_category WHERE is_active = 1 ORDER BY NAME",
                (rs, i) -> {
                    NamedItemData row = new NamedItemData();
                    row.setId(rs.getLong("id"));
                    row.setName(rs.getString("name"));
                    return row;
                }
        ));
        data.setProducts(jdbcTemplate.query(
                "SELECT a.id, a.code, a.name, a.category_id, b.mrp AS selected_mrp, " +
                        "IFNULL(b.disc_type, 0) AS disc_type, IFNULL(b.discount, 0) AS master_discount, " +
                        "ROUND(CASE WHEN b.disc_type = 1 THEN b.discount " +
                        "WHEN b.disc_type = 2 THEN (b.mrp * b.discount) / 100 ELSE 0 END, 2) AS discount_amount, " +
                        "b.id AS batch_id, a.unit_id, IFNULL(u.name,'') AS unit_name, IFNULL(b.commission,0) AS commission, " +
                        "IFNULL(u.convertion_unit,'') AS convertion_unit, IFNULL(s.total_stock, 0) AS total_stock " +
                        "FROM prod_product a " +
                        "JOIN prod_batch b ON b.product_id = a.id AND b.id = (SELECT MIN(id) FROM prod_batch WHERE product_id = a.id) " +
                        "LEFT JOIN prod_units u ON u.id = a.unit_id " +
                        "LEFT JOIN (SELECT product_id, SUM(stock) AS total_stock FROM prod_batch GROUP BY product_id) s ON s.product_id = a.id " +
                        "WHERE a.is_active = 1 ORDER BY a.name",
                (rs, i) -> {
                    ProductLookupData row = mapProduct(rs, i);
                    row.setCategoryId(rs.getLong("category_id"));
                    row.setStock(rs.getDouble("total_stock"));
                    return row;
                }
        ));
        return data;
    }

    public List<String> searchProductNames(String term) {
        String like = "%" + term + "%";
        return jdbcTemplate.query(
                "SELECT name FROM prod_product WHERE is_active = 1 AND (name LIKE ? OR CAST(code AS CHAR) LIKE ?) " +
                        "ORDER BY CASE WHEN CAST(code AS CHAR) = ? THEN 0 WHEN CAST(code AS CHAR) LIKE ? THEN 1 ELSE 2 END, name LIMIT 20",
                (rs, i) -> rs.getString("name"),
                like, like, term, term + "%"
        );
    }

    public ProductLookupData findProductByCode(String code) {
        List<ProductLookupData> rows = jdbcTemplate.query(
                productLookupSql("a.code = ?"),
                this::mapProduct,
                code
        );
        return rows.isEmpty() ? null : withStock(rows.get(0));
    }

    public ProductLookupData findProductByName(String name) {
        List<ProductLookupData> rows = jdbcTemplate.query(
                productLookupSql("a.name = ?"),
                this::mapProduct,
                name
        );
        return rows.isEmpty() ? null : withStock(rows.get(0));
    }

    public Double productStock(Long productId) {
        Double stock = jdbcTemplate.query(
                "SELECT SUM(stock) AS total_stock FROM prod_batch WHERE product_id = ?",
                rs -> rs.next() ? rs.getDouble("total_stock") : 0d,
                productId
        );
        return stock == null ? 0d : stock;
    }

    public List<CustomerData> searchCustomers(String query, String phone) {
        if (phone != null && !phone.isBlank()) {
            return jdbcTemplate.query(
                    customerSql("phone_number LIKE ?"),
                    this::mapCustomer,
                    "%" + phone + "%"
            );
        }
        return jdbcTemplate.query(
                customerSql("name LIKE ?"),
                this::mapCustomer,
                "%" + (query == null ? "" : query) + "%"
        );
    }

    public List<QuotationData> quotationList() {
        ensureQuotationFlags();
        return jdbcTemplate.query(
                "SELECT id, bill_display, cusName, cusPhn, payable, extraDisc, customerId, date, time, is_tax_bill, is_commission " +
                        "FROM prod_quotation WHERE is_cancelled = 0 AND is_billed = 0 " +
                        "ORDER BY date DESC, time DESC",
                (rs, i) -> mapQuotation(rs)
        );
    }

    public QuotationEditData quotationForEdit(Long quotId) {
        ensureQuotationFlags();
        List<QuotationData> headers = jdbcTemplate.query(
                "SELECT id, bill_display, cusName, cusPhn, payable, extraDisc, customerId, date, time, is_tax_bill, is_commission " +
                        "FROM prod_quotation WHERE id = ? AND is_cancelled = 0",
                (rs, i) -> mapQuotation(rs),
                quotId
        );
        if (headers.isEmpty()) {
            throw new RuntimeException("Hold not found");
        }
        QuotationData header = headers.get(0);
        List<QuotationLineData> lines = quotationDetails(quotId);
        boolean anyGst = lines.stream().anyMatch(line -> line.getGst() != null && line.getGst() > 0);
        boolean commissionFromTotal = lines.stream().anyMatch(line -> {
            double qty = line.getQty() == null ? 0 : line.getQty();
            double price = line.getPrice() == null ? 0 : line.getPrice();
            double disc = line.getDiscount() == null ? 0 : line.getDiscount();
            double total = line.getTotal() == null ? 0 : line.getTotal();
            return total + 0.05 < (qty * price - disc);
        });
        QuotationEditData data = new QuotationEditData();
        data.setCustomerName(header.getCustomerName());
        data.setCustomerPhone(header.getCustomerPhone());
        data.setCustomerId(header.getCustomerId());
        data.setExtraDiscount(header.getExtraDiscount());
        int storedTax = header.getIsTaxBill() == null ? 1 : header.getIsTaxBill();
        data.setIsTaxBill(storedTax == 0 ? 0 : (anyGst || storedTax == 1 ? 1 : 0));
        int commission = header.getIsCommission() == null ? 0 : header.getIsCommission();
        if (commission == 0 && commissionFromTotal) {
            commission = 1;
        }
        data.setIsCommission(commission);
        data.setLines(lines);
        return data;
    }

    private QuotationData mapQuotation(java.sql.ResultSet rs) throws java.sql.SQLException {
        QuotationData row = new QuotationData();
        row.setId(rs.getLong("id"));
        row.setBillDisplay(rs.getString("bill_display"));
        row.setCustomerName(rs.getString("cusName"));
        row.setCustomerPhone(rs.getString("cusPhn"));
        row.setPayable(rs.getDouble("payable"));
        row.setExtraDiscount(rs.getDouble("extraDisc"));
        row.setCustomerId(rs.getLong("customerId"));
        row.setDate(String.valueOf(rs.getDate("date")));
        row.setTime(String.valueOf(rs.getTime("time")));
        row.setIsTaxBill(rs.getInt("is_tax_bill"));
        row.setIsCommission(rs.getInt("is_commission"));
        return row;
    }

    public List<QuotationLineData> quotationDetails(Long quotId) {
        return jdbcTemplate.query(
                "SELECT d.prod_id, p.name AS prod_name, p.code, d.qty, d.price, d.disc, d.total, d.gst, " +
                        "IFNULL(b.id, 0) AS batch_id, IFNULL(b.commission, 0) AS commission, IFNULL(u.name, '') AS unit_name, " +
                        "IFNULL(d.image1, '') AS image1, IFNULL(d.image2, '') AS image2, IFNULL(d.metal_wt, 0) AS metal_wt, IFNULL(d.item_size, '') AS item_size, IFNULL(d.purity, 0) AS purity, " + GOLD_COLS + " " +
                        "FROM prod_quotation_details d " +
                        "JOIN prod_product p ON p.id = d.prod_id " +
                        "LEFT JOIN prod_batch b ON b.product_id = p.id " +
                        "LEFT JOIN prod_units u ON u.id = p.unit_id " +
                        "WHERE d.quot_id = ? AND d.is_cancelled = 0",
                (rs, i) -> {
                    QuotationLineData row = new QuotationLineData();
                    row.setProductId(rs.getLong("prod_id"));
                    row.setName(rs.getString("prod_name"));
                    row.setCode(rs.getString("code"));
                    row.setQty(rs.getDouble("qty"));
                    row.setPrice(rs.getDouble("price"));
                    row.setDiscount(rs.getDouble("disc"));
                    row.setTotal(rs.getDouble("total"));
                    row.setGst(rs.getInt("gst"));
                    row.setBatchId(rs.getLong("batch_id"));
                    row.setCommission(rs.getDouble("commission"));
                    row.setUnitName(rs.getString("unit_name"));
                    row.setImage1(nz(rs.getString("image1")));
                    row.setImage2(nz(rs.getString("image2")));
                    row.setMetalWt(rs.getDouble("metal_wt"));
                    row.setItemSize(nz(rs.getString("item_size")));
                    row.setPurity(rs.getDouble("purity"));
                    fillGold(row, rs);
                    return row;
                },
                quotId
        );
    }

    public PageResult<MonthBillCard> monthBills(int year, int month, int page, int size) {
        if (year < 2000 || month < 1 || month > 12) {
            throw new RuntimeException("Select a valid month");
        }
        String companyGstin = "";
        try {
            CompanyDetailsData company = adminService.company();
            if (company != null && company.getGstin() != null) {
                companyGstin = company.getGstin();
            }
        } catch (Exception ignored) {
            // company row may be missing
        }
        String fallbackGstin = companyGstin;
        java.time.YearMonth ym = java.time.YearMonth.of(year, month);
        String start = ym.atDay(1).toString();
        String end = ym.atEndOfMonth().toString();
        String sql = "SELECT a.id, a.bill_display, a.payable, a.date, a.time, a.paymentMode, a.is_tax_bill, " +
                "IFNULL(a.exchPoint, 0) AS exch_point, " +
                "IFNULL(c.name, a.cusName) AS customer_name, " +
                "IFNULL(c.phone_number, a.cusPhn) AS phone, " +
                "IFNULL(c.gstin, '') AS gstin, " +
                "EXISTS(SELECT 1 FROM prod_bill_details d WHERE d.bill_id = a.id AND IFNULL(d.is_exchanged,0)=1) AS exchanged, " +
                "EXISTS(SELECT 1 FROM prod_bill_details d WHERE d.bill_id = a.id AND IFNULL(d.is_exchanged,0)=2) AS returned " +
                "FROM prod_bill a LEFT JOIN customers c ON c.id = a.customerId " +
                "WHERE a.is_cancelled = 0 AND a.date BETWEEN ? AND ? " +
                "ORDER BY a.date DESC, a.time DESC, a.id DESC";
        return JdbcPageHelper.query(
                jdbcTemplate,
                sql,
                (rs, i) -> {
                    MonthBillCard row = new MonthBillCard();
                    row.setBillId(rs.getLong("id"));
                    row.setBillDisplay(rs.getString("bill_display"));
                    String name = nz(rs.getString("customer_name"));
                    row.setCustomerName("-".equals(name) ? "" : name);
                    String phone = nz(rs.getString("phone"));
                    row.setCustomerPhone("-".equals(phone) ? "" : phone);
                    row.setDate(String.valueOf(rs.getDate("date")));
                    row.setTime(String.valueOf(rs.getTime("time")));
                    row.setPayable(rs.getDouble("payable"));
                    row.setExchPoint(rs.getDouble("exch_point"));
                    row.setPaymentMode(rs.getInt("paymentMode"));
                    row.setIsTaxBill(rs.getInt("is_tax_bill"));
                    row.setExchanged(rs.getInt("exchanged") == 1);
                    row.setReturned(rs.getInt("returned") == 1);
                    String gstin = nz(rs.getString("gstin"));
                    if (gstin.isEmpty()) {
                        gstin = fallbackGstin;
                    }
                    row.setStateLabel(gstStateLabel(gstin));
                    return row;
                },
                page,
                size,
                start,
                end
        );
    }

    public EditBillLoadData editBill(String billNo) {
        String no = billNo == null ? "" : billNo.trim();
        if (no.isEmpty()) {
            throw new RuntimeException("Bill number is required");
        }
        List<EditBillLoadData> headers = jdbcTemplate.query(
                "SELECT b.id, b.bill_display, b.cusName, b.cusPhn, b.customerId, b.is_tax_bill, b.extraDisc, " +
                        "b.paymentMode, b.paymentType, b.balance, b.payable, IFNULL(b.paid, 0) AS paid_total, " +
                        "IFNULL(pay.cash, 0) AS cash, IFNULL(pay.bank, 0) AS bank, " +
                        "IFNULL(c.name, '') AS cust_name, IFNULL(c.phone_number, '') AS phone, " +
                        "IFNULL(c.exchange_point, 0) AS exchange_point, " +
                        "COALESCE(c.is_eligible_for_commission, 0) AS is_eligible, " +
                        "IFNULL(ca.advance, 0) AS advance " +
                        "FROM prod_bill b " +
                        "LEFT JOIN prod_bill_payment pay ON pay.bill_id = b.id " +
                        "LEFT JOIN customers c ON c.id = b.customerId " +
                        "LEFT JOIN customer_account ca ON ca.customer_id = b.customerId " +
                        "WHERE b.bill_display = ? AND IFNULL(b.is_cancelled, 0) = 0 LIMIT 1",
                (rs, i) -> {
                    EditBillLoadData data = new EditBillLoadData();
                    data.setBillId(rs.getLong("id"));
                    data.setBillDisplay(rs.getString("bill_display"));
                    String custName = nz(rs.getString("cust_name"));
                    data.setCustomerName(custName.isEmpty() || "-".equals(custName) ? nz(rs.getString("cusName")) : custName);
                    String phone = nz(rs.getString("phone"));
                    data.setCustomerPhone(phone.isEmpty() || "-".equals(phone) ? nz(rs.getString("cusPhn")) : phone);
                    long customerId = rs.getLong("customerId");
                    data.setCustomerId(rs.wasNull() ? 0L : customerId);
                    data.setIsTaxBill(rs.getInt("is_tax_bill"));
                    data.setExtraDisc(rs.getDouble("extraDisc"));
                    data.setPaymentMode(rs.getInt("paymentMode"));
                    int payType = rs.getInt("paymentType");
                    data.setPaymentType(payType <= 0 ? 1 : payType);
                    double cash = rs.getDouble("cash");
                    double bank = rs.getDouble("bank");
                    double paid = rs.getDouble("paid_total");
                    data.setCashPaid(cash);
                    data.setBankPaid(bank);
                    data.setPaid(paid);
                    data.setAdvanceUsed(Math.max(0, paid - cash - bank));
                    data.setBalance(rs.getDouble("balance"));
                    data.setPayable(rs.getDouble("payable"));
                    data.setExchangePoint(rs.getDouble("exchange_point"));
                    data.setAdvance(rs.getDouble("advance"));
                    data.setIsEligibleForCommission(rs.getInt("is_eligible"));
                    return data;
                },
                no
        );
        if (headers.isEmpty()) {
            throw new RuntimeException("Bill not found or has been cancelled");
        }
        EditBillLoadData bill = headers.get(0);
        if ("-".equals(bill.getCustomerName())) {
            bill.setCustomerName("");
        }
        if ("-".equals(bill.getCustomerPhone())) {
            bill.setCustomerPhone("");
        }
        bill.setProducts(jdbcTemplate.query(
                "SELECT d.prod_id, p.name AS prod_name, p.code, d.qty, d.price, d.disc, d.total, d.gst, " +
                        "IFNULL(d.commission, 0) AS commission, IFNULL(u.name, '') AS unit_name, " +
                        "IFNULL(d.image1, '') AS image1, IFNULL(d.image2, '') AS image2, IFNULL(d.metal_wt, 0) AS metal_wt, IFNULL(d.item_size, '') AS item_size, IFNULL(d.purity, 0) AS purity, " + GOLD_COLS + ", " +
                        "IFNULL((SELECT id FROM prod_batch WHERE product_id = d.prod_id ORDER BY id DESC LIMIT 1), 0) AS batch_id " +
                        "FROM prod_bill_details d " +
                        "JOIN prod_product p ON p.id = d.prod_id " +
                        "LEFT JOIN prod_units u ON u.id = p.unit_id " +
                        "WHERE d.bill_id = ?",
                (rs, i) -> {
                    QuotationLineData row = new QuotationLineData();
                    row.setProductId(rs.getLong("prod_id"));
                    row.setName(rs.getString("prod_name"));
                    row.setCode(rs.getString("code"));
                    row.setQty(rs.getDouble("qty"));
                    row.setPrice(rs.getDouble("price"));
                    row.setDiscount(rs.getDouble("disc"));
                    row.setTotal(rs.getDouble("total"));
                    row.setGst(rs.getInt("gst"));
                    row.setBatchId(rs.getLong("batch_id"));
                    row.setCommission(rs.getDouble("commission"));
                    row.setUnitName(rs.getString("unit_name"));
                    row.setImage1(nz(rs.getString("image1")));
                    row.setImage2(nz(rs.getString("image2")));
                    row.setMetalWt(rs.getDouble("metal_wt"));
                    row.setItemSize(nz(rs.getString("item_size")));
                    row.setPurity(rs.getDouble("purity"));
                    fillGold(row, rs);
                    return row;
                },
                bill.getBillId()
        ));
        return bill;
    }

    public List<BillingListItemData> itemList(String from, String to, boolean unfinished, boolean finished) {
        ensureQuotationFlags();
        String sql =
                "SELECT b.id AS bill_id, b.bill_display, b.date, b.time, " +
                        "IFNULL(NULLIF(TRIM(c.name), ''), IFNULL(b.cusName, '')) AS customer_name, " +
                        "IFNULL(NULLIF(TRIM(c.phone_number), ''), IFNULL(b.cusPhn, '')) AS phone, " +
                        "p.name AS item_name, IFNULL(d.item_size, '') AS item_size, IFNULL(d.purity, 0) AS purity, IFNULL(d.metal_wt, 0) AS metal_wt, " + GOLD_COLS + ", d.price AS cost, " +
                        "IFNULL(b.paid, 0) AS paid, IFNULL(b.payable, 0) AS payable, " +
                        "IFNULL(pay.cash, 0) + IFNULL(pay.bank, 0) AS cash, " +
                        "GREATEST(IFNULL(b.advance_used, 0), GREATEST(0, IFNULL(b.paid, 0) - IFNULL(pay.cash, 0) - IFNULL(pay.bank, 0))) AS advance_used, " +
                        "IFNULL(d.image1, '') AS image1, IFNULL(d.image2, '') AS image2 " +
                        "FROM prod_bill b " +
                        "JOIN prod_bill_details d ON d.bill_id = b.id " +
                        "JOIN prod_product p ON p.id = d.prod_id " +
                        "LEFT JOIN customers c ON c.id = b.customerId " +
                        "LEFT JOIN prod_bill_payment pay ON pay.bill_id = b.id " +
                        "WHERE IFNULL(b.is_cancelled, 0) = 0 ";
        if (unfinished) {
            return jdbcTemplate.query(
                    sql + "AND IFNULL(d.price, 0) <= 0 ORDER BY b.date ASC, b.time ASC, b.id ASC, d.id ASC",
                    this::mapListItem
            );
        }
        String start = (from == null || from.isBlank()) ? java.time.LocalDate.now().toString() : from.trim();
        String end = (to == null || to.isBlank()) ? java.time.LocalDate.now().toString() : to.trim();
        String wtFilter = finished ? "AND IFNULL(d.price, 0) > 0 " : "";
        return jdbcTemplate.query(
                sql + wtFilter + "AND b.date BETWEEN ? AND ? ORDER BY b.date DESC, b.time DESC, b.id DESC, d.id",
                this::mapListItem,
                start,
                end
        );
    }

    private BillingListItemData mapListItem(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        BillingListItemData row = new BillingListItemData();
        row.setBillId(rs.getLong("bill_id"));
        row.setBillDisplay(rs.getString("bill_display"));
        row.setDate(String.valueOf(rs.getDate("date")));
        row.setTime(String.valueOf(rs.getTime("time")));
        String name = nz(rs.getString("customer_name"));
        row.setCustomerName("-".equals(name) ? "" : name);
        String phone = nz(rs.getString("phone"));
        row.setPhone("-".equals(phone) ? "" : phone);
        row.setItemName(nz(rs.getString("item_name")));
        row.setItemSize(nz(rs.getString("item_size")));
        row.setPurity(rs.getDouble("purity"));
        row.setMetalWt(rs.getDouble("metal_wt"));
        row.setWastagePer(rs.getDouble("wastage_per"));
        row.setStoneWt(rs.getDouble("stone_wt"));
        row.setStoneWastage(rs.getDouble("stone_wastage"));
        row.setStoneCost(rs.getDouble("stone_cost"));
        row.setGramRate(rs.getDouble("gram_rate"));
        row.setChargeType(nz(rs.getString("charge_type")));
        row.setChargeAmt(rs.getDouble("charge_amt"));
        row.setCost(rs.getDouble("cost"));
        row.setPaid(rs.getDouble("paid"));
        row.setPayable(rs.getDouble("payable"));
        row.setCash(rs.getDouble("cash"));
        row.setAdvanceUsed(rs.getDouble("advance_used"));
        String image1 = nz(rs.getString("image1"));
        String image2 = nz(rs.getString("image2"));
        row.setImage1(image1);
        row.setImage2(image2);
        row.setMissingImage(image1.isBlank() && image2.isBlank());
        return row;
    }

    public List<GalleryPhotoData> gallery(String item) {
        ensureQuotationFlags();
        String term = item == null ? "" : item.trim();
        String sql =
                "SELECT b.id AS bill_id, b.bill_display, b.date, " +
                        "IFNULL(NULLIF(TRIM(c.name), ''), IFNULL(b.cusName, '')) AS customer_name, " +
                        "IFNULL(p.name, '') AS item_name, IFNULL(d.metal_wt, 0) AS metal_wt, IFNULL(d.price, 0) AS finishing_wt, IFNULL(d.purity, 0) AS purity, " + GOLD_COLS + ", " +
                        "IFNULL(d.image1,'') AS image1, IFNULL(d.image2,'') AS image2 " +
                        "FROM prod_bill b " +
                        "JOIN prod_bill_details d ON d.bill_id = b.id " +
                        "LEFT JOIN prod_product p ON p.id = d.prod_id " +
                        "LEFT JOIN customers c ON c.id = b.customerId " +
                        "WHERE IFNULL(b.is_cancelled, 0) = 0 " +
                        "AND (NULLIF(TRIM(d.image1),'') IS NOT NULL OR NULLIF(TRIM(d.image2),'') IS NOT NULL) ";
        if (!term.isEmpty()) {
            sql += "AND IFNULL(p.name, '') LIKE ? ";
        }
        sql += "ORDER BY b.date DESC, b.id DESC, d.id";
        org.springframework.jdbc.core.RowMapper<GalleryPhotoData> mapper = (rs, i) -> {
            GalleryPhotoData photo = new GalleryPhotoData();
            photo.setBillId(rs.getLong("bill_id"));
            photo.setBillDisplay(nz(rs.getString("bill_display")));
            java.sql.Date date = rs.getDate("date");
            photo.setDate(date == null ? "" : String.valueOf(date));
            String name = nz(rs.getString("customer_name"));
            photo.setCustomerName("-".equals(name) ? "" : name);
            photo.setItemName(nz(rs.getString("item_name")));
            photo.setMetalWt(rs.getDouble("metal_wt"));
            photo.setFinishingWt(rs.getDouble("finishing_wt"));
            photo.setPurity(rs.getDouble("purity"));
            photo.setWastagePer(rs.getDouble("wastage_per"));
            photo.setStoneWt(rs.getDouble("stone_wt"));
            photo.setStoneWastage(rs.getDouble("stone_wastage"));
            photo.setStoneCost(rs.getDouble("stone_cost"));
            photo.setGramRate(rs.getDouble("gram_rate"));
            photo.setChargeType(nz(rs.getString("charge_type")));
            photo.setChargeAmt(rs.getDouble("charge_amt"));
            photo.setImage1(nz(rs.getString("image1")));
            photo.setImage2(nz(rs.getString("image2")));
            return photo;
        };
        if (!term.isEmpty()) {
            return jdbcTemplate.query(sql, mapper, "%" + term + "%");
        }
        return jdbcTemplate.query(sql, mapper);
    }

    public List<RecentBillData> recentBills() {
        return jdbcTemplate.query(
                "SELECT id, bill_display, total, paid, DATE, TIME, cusName FROM prod_bill " +
                        "WHERE is_cancelled = 0 ORDER BY id DESC LIMIT 50",
                (rs, i) -> {
                    RecentBillData row = new RecentBillData();
                    row.setId(rs.getLong("id"));
                    row.setBillDisplay(rs.getString("bill_display"));
                    row.setTotal(rs.getDouble("total"));
                    row.setPaid(rs.getDouble("paid"));
                    row.setDate(String.valueOf(rs.getDate("DATE")));
                    row.setTime(String.valueOf(rs.getTime("TIME")));
                    row.setCustomerName(rs.getString("cusName"));
                    return row;
                }
        );
    }

    public List<ProductHistoryData> productHistory(Long productId, Long customerId) {
        String sql = "SELECT pb.bill_display, pb.date, pb.time, pbd.qty, pbd.price, pbd.disc, pbd.total, pb.cusName " +
                "FROM prod_bill pb JOIN prod_bill_details pbd ON pb.id = pbd.bill_id " +
                "WHERE pbd.prod_id = ? AND (pb.is_cancelled IS NULL OR pb.is_cancelled = 0) ";
        if (customerId != null && customerId > 0) {
            sql += "AND pb.customerId = ? ";
        }
        sql += "ORDER BY pb.date DESC, pb.time DESC LIMIT 6";
        Object[] args = (customerId != null && customerId > 0)
                ? new Object[]{productId, customerId}
                : new Object[]{productId};
        return jdbcTemplate.query(sql, (rs, i) -> {
            ProductHistoryData row = new ProductHistoryData();
            row.setBillNo(rs.getString("bill_display"));
            row.setDate(String.valueOf(rs.getDate("date")));
            row.setTime(String.valueOf(rs.getTime("time")));
            row.setQty(rs.getDouble("qty"));
            row.setPrice(rs.getDouble("price"));
            row.setDiscount(rs.getDouble("disc"));
            row.setTotal(rs.getDouble("total"));
            row.setCustomerName(rs.getString("cusName"));
            return row;
        }, args);
    }

    public PrintBillData printBill(String billNo) {
        List<PrintBillData> headers = jdbcTemplate.query(
                "SELECT b.id, b.bill_display, b.cusName, b.cusPhn, b.DATE, b.TIME, b.total, b.prodDisc, b.extraDisc, " +
                        "IFNULL(b.exchPoint, 0) AS exchPoint, b.payable, b.paid, b.balance, b.paymentMode, b.paymentType, b.is_tax_bill, " +
                        "IFNULL(b.customerId, 0) AS customerId, " +
                        "c.name AS cust_name, c.phone_number, c.address, c.gstin " +
                        "FROM prod_bill b LEFT JOIN customers c ON c.id = b.customerId " +
                        "WHERE b.bill_display = ? AND b.is_cancelled = 0",
                (rs, i) -> {
                    PrintBillData data = new PrintBillData();
                    data.setBillId(rs.getLong("id"));
                    data.setBillDisplay(rs.getString("bill_display"));
                    String custName = nz(rs.getString("cust_name"));
                    data.setCustomerName(custName.isEmpty() ? nz(rs.getString("cusName")) : custName);
                    String phone = nz(rs.getString("phone_number"));
                    data.setCustomerPhone(phone.isEmpty() ? nz(rs.getString("cusPhn")) : phone);
                    data.setCustomerAddress(nz(rs.getString("address")));
                    data.setCustomerGstin(nz(rs.getString("gstin")));
                    data.setDate(String.valueOf(rs.getDate("DATE")));
                    data.setTime(String.valueOf(rs.getTime("TIME")));
                    data.setPriceTotal(rs.getDouble("total"));
                    data.setProductDiscount(rs.getDouble("prodDisc"));
                    data.setExtraDiscount(rs.getDouble("extraDisc"));
                    data.setExchangePointUsed(rs.getDouble("exchPoint"));
                    data.setPayable(rs.getDouble("payable"));
                    data.setPaid(rs.getDouble("paid"));
                    data.setBalance(rs.getDouble("balance"));
                    data.setPaymentMode(rs.getInt("paymentMode"));
                    data.setPaymentType(rs.getInt("paymentType"));
                    data.setIsTaxBill(rs.getInt("is_tax_bill"));
                    data.setCustomerId(rs.getLong("customerId"));
                    return data;
                },
                billNo
        );
        if (headers.isEmpty()) {
            throw new RuntimeException("Bill not found");
        }
        PrintBillData bill = headers.get(0);
        CompanyDetailsData company = adminService.company();
        bill.setPrintType(company.getPrintType() == null ? 1 : company.getPrintType());
        bill.setPrinterName(nz(company.getPrinterName()));
        bill.setCompanyName(nz(company.getShopName()));
        bill.setCompanyAddress(nz(company.getAddress()));
        bill.setCompanyGstin(nz(company.getGstin()));
        bill.setCompanyBankDetails(nz(company.getBankDetails()));
        bill.setAmountInWords(AmountInWords.from(bill.getPaid() == null ? 0 : bill.getPaid()));
        bill.setItems(jdbcTemplate.query(
                "SELECT p.code, p.name, d.qty, d.price, d.disc, d.total, d.gst, IFNULL(d.is_exchanged,0) AS is_exchanged, " +
                        "IFNULL(cat.name,'') AS category_name, " +
                        "CASE WHEN p.hsn IS NULL OR p.hsn = 0 THEN '' ELSE CAST(p.hsn AS CHAR) END AS hsn, " +
                        "IFNULL(u.name,'') AS unit_name, IFNULL(d.image1,'') AS image1, IFNULL(d.image2,'') AS image2, IFNULL(d.metal_wt, 0) AS metal_wt, IFNULL(d.item_size,'') AS item_size, IFNULL(d.purity, 0) AS purity, " + GOLD_COLS + " " +
                        "FROM prod_bill_details d JOIN prod_product p ON p.id = d.prod_id " +
                        "JOIN prod_bill b ON b.id = d.bill_id " +
                        "LEFT JOIN prod_category cat ON cat.id = p.category_id " +
                        "LEFT JOIN prod_units u ON u.id = p.unit_id " +
                        "WHERE b.bill_display = ?",
                (rs, i) -> {
                    PrintBillData.PrintLineData line = new PrintBillData.PrintLineData();
                    line.setCode(rs.getString("code"));
                    line.setName(rs.getString("name"));
                    line.setCategoryName(nz(rs.getString("category_name")));
                    line.setHsn(nz(rs.getString("hsn")));
                    line.setUnitName(nz(rs.getString("unit_name")));
                    line.setQty(rs.getDouble("qty"));
                    line.setPrice(rs.getDouble("price"));
                    line.setDiscount(rs.getDouble("disc"));
                    line.setTotal(rs.getDouble("total"));
                    line.setGst(rs.getInt("gst"));
                    line.setIsExchanged(rs.getInt("is_exchanged"));
                    line.setImage1(nz(rs.getString("image1")));
                    line.setImage2(nz(rs.getString("image2")));
                    line.setMetalWt(rs.getDouble("metal_wt"));
                    line.setItemSize(nz(rs.getString("item_size")));
                    line.setPurity(rs.getDouble("purity"));
                    fillGold(line, rs);
                    return line;
                },
                billNo
        ));
        if (bill.getItems() != null) {
            bill.setExchanged(bill.getItems().stream().anyMatch(l -> l.getIsExchanged() != null && l.getIsExchanged() == 1));
            bill.setReturned(bill.getItems().stream().anyMatch(l -> l.getIsExchanged() != null && l.getIsExchanged() == 2));
        }
        attachPayments(bill);
        attachOldDues(bill);
        boolean taxBill = bill.getIsTaxBill() != null && bill.getIsTaxBill() == 1;
        bill.setDocTitle(taxBill ? "Tax Invoice" : "");
        bill.setDocNoLabel("Invoice No.");
        return bill;
    }

    public PrintBillData printHold(Long quotId) {
        List<PrintBillData> headers = jdbcTemplate.query(
                "SELECT q.id, q.bill_display, q.cusName, q.cusPhn, q.date, q.time, q.total, q.prodDisc, q.extraDisc, q.payable, " +
                        "c.name AS cust_name, c.phone_number, c.address, c.gstin " +
                        "FROM prod_quotation q LEFT JOIN customers c ON c.id = q.customerId " +
                        "WHERE q.id = ? AND q.is_cancelled = 0",
                (rs, i) -> {
                    PrintBillData data = new PrintBillData();
                    data.setBillId(rs.getLong("id"));
                    data.setBillDisplay(rs.getString("bill_display"));
                    String custName = nz(rs.getString("cust_name"));
                    data.setCustomerName(custName.isEmpty() ? nz(rs.getString("cusName")) : custName);
                    String phone = nz(rs.getString("phone_number"));
                    data.setCustomerPhone(phone.isEmpty() ? nz(rs.getString("cusPhn")) : phone);
                    data.setCustomerAddress(nz(rs.getString("address")));
                    data.setCustomerGstin(nz(rs.getString("gstin")));
                    data.setDate(String.valueOf(rs.getDate("date")));
                    data.setTime(String.valueOf(rs.getTime("time")));
                    data.setPriceTotal(rs.getDouble("total"));
                    data.setProductDiscount(rs.getDouble("prodDisc"));
                    data.setExtraDiscount(rs.getDouble("extraDisc"));
                    data.setPayable(rs.getDouble("payable"));
                    data.setPaid(0d);
                    data.setBalance(rs.getDouble("payable"));
                    return data;
                },
                quotId
        );
        if (headers.isEmpty()) {
            throw new RuntimeException("Hold not found");
        }
        PrintBillData bill = headers.get(0);
        applyCompany(bill);
        bill.setAmountInWords(AmountInWords.from(bill.getPayable() == null ? 0 : bill.getPayable()));
        bill.setDocTitle("Quotation");
        bill.setDocNoLabel("Quotation No.");
        bill.setItems(jdbcTemplate.query(
                "SELECT p.code, p.name, d.qty, d.price, d.disc, d.total, d.gst, " +
                        "IFNULL(cat.name,'') AS category_name, " +
                        "CASE WHEN p.hsn IS NULL OR p.hsn = 0 THEN '' ELSE CAST(p.hsn AS CHAR) END AS hsn, " +
                        "IFNULL(u.name,'') AS unit_name, IFNULL(d.metal_wt, 0) AS metal_wt, IFNULL(d.item_size,'') AS item_size, IFNULL(d.purity, 0) AS purity, " + GOLD_COLS + " " +
                        "FROM prod_quotation_details d JOIN prod_product p ON p.id = d.prod_id " +
                        "LEFT JOIN prod_category cat ON cat.id = p.category_id " +
                        "LEFT JOIN prod_units u ON u.id = p.unit_id " +
                        "WHERE d.quot_id = ? AND d.is_cancelled = 0",
                (rs, i) -> {
                    PrintBillData.PrintLineData line = new PrintBillData.PrintLineData();
                    line.setCode(rs.getString("code"));
                    line.setName(rs.getString("name"));
                    line.setCategoryName(nz(rs.getString("category_name")));
                    line.setHsn(nz(rs.getString("hsn")));
                    line.setUnitName(nz(rs.getString("unit_name")));
                    line.setQty(rs.getDouble("qty"));
                    line.setPrice(rs.getDouble("price"));
                    line.setDiscount(rs.getDouble("disc"));
                    line.setTotal(rs.getDouble("total"));
                    line.setGst(rs.getInt("gst"));
                    line.setMetalWt(rs.getDouble("metal_wt"));
                    line.setItemSize(nz(rs.getString("item_size")));
                    line.setPurity(rs.getDouble("purity"));
                    fillGold(line, rs);
                    return line;
                },
                quotId
        ));
        return bill;
    }

    private void applyCompany(PrintBillData bill) {
        CompanyDetailsData company = adminService.company();
        bill.setPrintType(company.getPrintType() == null ? 1 : company.getPrintType());
        bill.setPrinterName(nz(company.getPrinterName()));
        bill.setCompanyName(nz(company.getShopName()));
        bill.setCompanyAddress(nz(company.getAddress()));
        bill.setCompanyGstin(nz(company.getGstin()));
        bill.setCompanyBankDetails(nz(company.getBankDetails()));
    }

    private void attachPayments(PrintBillData bill) {
        double cash = 0;
        double bank = 0;
        List<double[]> amounts = jdbcTemplate.query(
                "SELECT IFNULL(cash,0) AS cash, IFNULL(bank,0) AS bank FROM prod_bill_payment WHERE bill_id = ? LIMIT 1",
                (rs, i) -> new double[]{rs.getDouble("cash"), rs.getDouble("bank")},
                bill.getBillId()
        );
        if (!amounts.isEmpty()) {
            cash = amounts.get(0)[0];
            bank = amounts.get(0)[1];
        }
        bill.setCashPaid(cash);
        bill.setBankPaid(bank);
        List<PrintBillData.PrintPaymentRow> rows = new ArrayList<>();
        PrintBillData.PrintPaymentRow first = new PrintBillData.PrintPaymentRow();
        first.setDate(bill.getDate());
        first.setMode(payModeLabel(bill.getPaymentMode()));
        first.setMethod(payTypeLabel(bill.getPaymentType()));
        first.setPaid(cash + bank);
        double initialBal = (bill.getPayable() == null ? 0 : bill.getPayable()) - (cash + bank);
        first.setBalance(Math.max(0, initialBal));
        rows.add(first);
        try {
            rows.addAll(jdbcTemplate.query(
                    "SELECT a.date, CASE WHEN a.mode=1 THEN 'Cash' ELSE 'Bank' END AS mode_name, " +
                            "CASE WHEN a.bankOption=0 THEN '-' WHEN a.bankOption=1 THEN 'UPI' WHEN a.bankOption=2 THEN 'Debit Card' " +
                            "WHEN a.bankOption=3 THEN 'Credit Card' WHEN a.bankOption=4 THEN 'NEFT' WHEN a.bankOption=5 THEN 'Wallet' ELSE '-' END AS method_name, " +
                            "a.paid, a.finalBalance FROM prod_bill_due_collection a WHERE a.bill_id = ? ORDER BY a.date, a.time",
                    (rs, i) -> {
                        PrintBillData.PrintPaymentRow row = new PrintBillData.PrintPaymentRow();
                        row.setDate(String.valueOf(rs.getDate("date")));
                        row.setMode(nz(rs.getString("mode_name")));
                        row.setMethod(nz(rs.getString("method_name")));
                        row.setPaid(rs.getDouble("paid"));
                        row.setBalance(rs.getDouble("finalBalance"));
                        return row;
                    },
                    bill.getBillId()
            ));
        } catch (Exception ignored) {
            // due collection table may be empty or unavailable
        }
        bill.setPayments(rows);
    }

    private void attachOldDues(PrintBillData bill) {
        long customerId = bill.getCustomerId() == null ? 0 : bill.getCustomerId();
        long billId = bill.getBillId() == null ? 0 : bill.getBillId();
        if (customerId <= 0 || billId <= 0) {
            return;
        }
        try {
            bill.setOldDues(jdbcTemplate.query(
                    "SELECT IFNULL(b.currentBalance, 0) AS due_wt, " +
                            "(SELECT GROUP_CONCAT(p.name ORDER BY d.id SEPARATOR ', ') " +
                            " FROM prod_bill_details d JOIN prod_product p ON p.id = d.prod_id " +
                            " WHERE d.bill_id = b.id) AS item_name " +
                            "FROM prod_bill b " +
                            "WHERE IFNULL(b.customerId, 0) = ? AND b.id <> ? AND IFNULL(b.is_cancelled, 0) = 0 " +
                            "AND IFNULL(b.currentBalance, 0) > 0.0005 " +
                            "AND (b.date < ? OR (b.date = ? AND (b.time < ? OR (b.time = ? AND b.id < ?)))) " +
                            "ORDER BY b.date, b.time, b.id",
                    (rs, i) -> {
                        PrintBillData.OldDueRow row = new PrintBillData.OldDueRow();
                        row.setItemName(nz(rs.getString("item_name")));
                        row.setBalance(rs.getDouble("due_wt"));
                        return row;
                    },
                    customerId,
                    billId,
                    bill.getDate(),
                    bill.getDate(),
                    bill.getTime(),
                    bill.getTime(),
                    billId
            ));
        } catch (Exception ignored) {
            bill.setOldDues(new ArrayList<>());
        }
    }

    private String payModeLabel(Integer mode) {
        if (mode == null) return "-";
        return switch (mode) {
            case 1 -> "Cash";
            case 2 -> "Bank";
            case 3 -> "Cash & Bank";
            default -> "-";
        };
    }

    private String payTypeLabel(Integer type) {
        if (type == null) return "-";
        return switch (type) {
            case 1 -> "UPI";
            case 2 -> "Debit Card";
            case 3 -> "Credit Card";
            case 4 -> "NEFT";
            case 5 -> "Wallet";
            default -> "-";
        };
    }

    private String gstStateLabel(String gstin) {
        if (gstin == null || gstin.trim().length() < 2) {
            return "";
        }
        String code = gstin.trim().substring(0, 2);
        String name = switch (code) {
            case "01" -> "Jammu & Kashmir";
            case "02" -> "Himachal Pradesh";
            case "03" -> "Punjab";
            case "04" -> "Chandigarh";
            case "05" -> "Uttarakhand";
            case "06" -> "Haryana";
            case "07" -> "Delhi";
            case "08" -> "Rajasthan";
            case "09" -> "Uttar Pradesh";
            case "10" -> "Bihar";
            case "11" -> "Sikkim";
            case "12" -> "Arunachal Pradesh";
            case "13" -> "Nagaland";
            case "14" -> "Manipur";
            case "15" -> "Mizoram";
            case "16" -> "Tripura";
            case "17" -> "Meghalaya";
            case "18" -> "Assam";
            case "19" -> "West Bengal";
            case "20" -> "Jharkhand";
            case "21" -> "Odisha";
            case "22" -> "Chhattisgarh";
            case "23" -> "Madhya Pradesh";
            case "24" -> "Gujarat";
            case "26" -> "Dadra & Nagar Haveli and Daman & Diu";
            case "27" -> "Maharashtra";
            case "29" -> "Karnataka";
            case "30" -> "Goa";
            case "31" -> "Lakshadweep";
            case "32" -> "Kerala";
            case "33" -> "Tamil Nadu";
            case "34" -> "Puducherry";
            case "35" -> "Andaman & Nicobar";
            case "36" -> "Telangana";
            case "37" -> "Andhra Pradesh";
            case "38" -> "Ladakh";
            case "97" -> "Other Territory";
            default -> "";
        };
        if (name.isEmpty()) {
            return "";
        }
        return code + " - " + name;
    }

    private String nz(String value) {
        return value == null ? "" : value.trim();
    }

    private void fillGold(QuotationLineData row, java.sql.ResultSet rs) throws java.sql.SQLException {
        row.setWastagePer(rs.getDouble("wastage_per"));
        row.setStoneWt(rs.getDouble("stone_wt"));
        row.setStoneWastage(rs.getDouble("stone_wastage"));
        row.setStoneCost(rs.getDouble("stone_cost"));
        row.setGramRate(rs.getDouble("gram_rate"));
        row.setChargeType(nz(rs.getString("charge_type")));
        row.setChargeAmt(rs.getDouble("charge_amt"));
        row.setItemDetails(nz(rs.getString("item_details")));
    }

    private void fillGold(PrintBillData.PrintLineData line, java.sql.ResultSet rs) throws java.sql.SQLException {
        line.setWastagePer(rs.getDouble("wastage_per"));
        line.setStoneWt(rs.getDouble("stone_wt"));
        line.setStoneWastage(rs.getDouble("stone_wastage"));
        line.setStoneCost(rs.getDouble("stone_cost"));
        line.setGramRate(rs.getDouble("gram_rate"));
        line.setChargeType(nz(rs.getString("charge_type")));
        line.setChargeAmt(rs.getDouble("charge_amt"));
        line.setItemDetails(nz(rs.getString("item_details")));
    }

    private String productLookupSql(String where) {
        return "SELECT a.id, a.code, a.name, b.mrp AS selected_mrp, " +
                "IFNULL(b.disc_type, 0) AS disc_type, IFNULL(b.discount, 0) AS master_discount, " +
                "ROUND(CASE WHEN b.disc_type = 1 THEN b.discount " +
                "WHEN b.disc_type = 2 THEN (b.mrp * b.discount) / 100 ELSE 0 END, 2) AS discount_amount, " +
                "b.id AS batch_id, a.unit_id, IFNULL(u.name,'') AS unit_name, IFNULL(b.commission,0) AS commission, " +
                "IFNULL(u.convertion_unit,'') AS convertion_unit " +
                "FROM prod_product a JOIN prod_batch b ON b.product_id = a.id " +
                "LEFT JOIN prod_units u ON u.id = a.unit_id WHERE " + where;
    }

    private ProductLookupData mapProduct(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        ProductLookupData data = new ProductLookupData();
        data.setId(rs.getLong("id"));
        data.setCode(rs.getString("code"));
        data.setName(rs.getString("name"));
        data.setMrp(rs.getDouble("selected_mrp"));
        data.setDiscType(rs.getInt("disc_type"));
        data.setProductDiscount(rs.getDouble("master_discount"));
        data.setDiscount(rs.getDouble("discount_amount"));
        data.setBatchId(rs.getLong("batch_id"));
        data.setUnitId(rs.getLong("unit_id"));
        data.setUnitName(rs.getString("unit_name"));
        data.setCommission(rs.getDouble("commission"));
        data.setConvertionUnit(rs.getString("convertion_unit"));
        return data;
    }

    private ProductLookupData withStock(ProductLookupData data) {
        data.setStock(productStock(data.getId()));
        return data;
    }

    private String customerSql(String where) {
        return "SELECT id, name, " +
                "CASE WHEN phone_number = '' OR phone_number IS NULL THEN '-' ELSE phone_number END AS phone_number, " +
                "CASE WHEN address = '' OR address IS NULL THEN '-' ELSE address END AS address, " +
                "CASE WHEN gstin = '' OR gstin IS NULL THEN '-' ELSE gstin END AS gstin, " +
                "COALESCE(credit_limit, 0) AS credit_limit, COALESCE(is_gst, 0) AS is_gst, " +
                "COALESCE(is_eligible_for_commission, 0) AS is_eligible_for_commission, " +
                "COALESCE(exchange_point, 0) AS exchange_point, " +
                "COALESCE((SELECT advance FROM customer_account WHERE customer_id = customers.id), 0) AS advance " +
                "FROM customers WHERE is_active = 1 AND " + where + " ORDER BY name LIMIT 10";
    }

    private CustomerData mapCustomer(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        CustomerData data = new CustomerData();
        data.setId(rs.getLong("id"));
        data.setName(rs.getString("name"));
        data.setPhone(rs.getString("phone_number"));
        data.setAddress(rs.getString("address"));
        data.setGstin(rs.getString("gstin"));
        data.setCreditLimit(rs.getDouble("credit_limit"));
        data.setIsGst(rs.getInt("is_gst"));
        data.setIsEligibleForCommission(rs.getInt("is_eligible_for_commission"));
        data.setExchangePoint(rs.getDouble("exchange_point"));
        data.setAdvance(rs.getDouble("advance"));
        return data;
    }
}
