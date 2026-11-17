package com.billing.pos.dto;

import lombok.Data;

@Data
public class BillingListItemData {
    private Long billId;
    private String billDisplay;
    private String date;
    private String time;
    private String customerName;
    private String phone;
    private String itemName;
    private String itemSize;
    private Double purity;
    private Double metalWt;
    private Double cost;
    private Double paid;
    private Double payable;
    private String image1;
    private String image2;
    private Boolean missingImage;
}
