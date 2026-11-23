package com.billing.pos.dto;

import lombok.Data;

@Data
public class QuotationLineData {
    private Long productId;
    private String name;
    private String code;
    private Double qty;
    private Double price;
    private Double discount;
    private Double total;
    private Integer gst;
    private Long batchId;
    private Double commission;
    private String unitName;
    private String image1;
    private String image2;
    private Double metalWt;
    private String itemSize;
    private Double purity;
    private Double wastagePer;
    private Double stoneWt;
    private Double stoneWastage;
    private Double stoneCost;
    private Double gramRate;
    private String chargeType;
    private Double chargeAmt;
    private String itemDetails;
}
